pub mod parser;
pub mod resolve;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use serde::Serialize;

use crate::constants::IGNORED;
use crate::link_index::parser::{parse_links, LinkKind};
use crate::link_index::resolve::{resolve_href, Resolution};

const MAX_WALK_DEPTH: u32 = 20;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingLink {
    pub target: Option<String>,
    pub raw_href: String,
    pub line: u32,
    pub col: u32,
    pub kind: LinkKind,
    pub is_external: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub source: String,
    pub line: u32,
    pub snippet: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BrokenLink {
    pub source: String,
    pub raw_href: String,
    pub line: u32,
    pub kind: LinkKind,
}

#[derive(Debug, Clone)]
struct LinkEdge {
    target: Option<PathBuf>,
    raw_href: String,
    line: u32,
    col: u32,
    kind: LinkKind,
    is_external: bool,
}

#[derive(Debug, Clone)]
struct BackRef {
    source: PathBuf,
    line: u32,
    snippet: String,
}

#[derive(Default)]
struct GraphInner {
    root: Option<PathBuf>,
    outgoing: HashMap<PathBuf, Vec<LinkEdge>>,
    incoming: HashMap<PathBuf, Vec<BackRef>>,
    all_md: HashSet<PathBuf>,
}

pub struct LinkGraph {
    inner: RwLock<GraphInner>,
}

impl LinkGraph {
    pub fn new() -> Self {
        Self { inner: RwLock::new(GraphInner::default()) }
    }

    pub fn set_root(&self, root: Option<PathBuf>) {
        let mut g = self.inner.write().unwrap();
        g.outgoing.clear();
        g.incoming.clear();
        g.all_md.clear();
        g.root = root;
    }

    pub fn root(&self) -> Option<PathBuf> {
        self.inner.read().unwrap().root.clone()
    }

    pub fn reindex_file(&self, path: &Path, source: &str) {
        let path = path.to_path_buf();
        let mut g = self.inner.write().unwrap();
        let root = match g.root.clone() {
            Some(r) => r,
            None => return,
        };

        purge_outgoing(&mut g, &path);

        if is_md(&path) {
            g.all_md.insert(path.clone());
        }

        let parsed = parse_links(source);
        let mut new_edges = Vec::with_capacity(parsed.len());
        for p in parsed {
            let (target, is_external) = match resolve_href(&path, &root, &p.href) {
                Resolution::Internal(t) => (Some(t), false),
                Resolution::External => (None, true),
                Resolution::Unresolved => (None, false),
            };

            if let Some(ref t) = target {
                g.incoming.entry(t.clone()).or_default().push(BackRef {
                    source: path.clone(),
                    line: p.line,
                    snippet: p.snippet,
                });
            }

            new_edges.push(LinkEdge {
                target,
                raw_href: p.href,
                line: p.line,
                col: p.col,
                kind: p.kind,
                is_external,
            });
        }

        g.outgoing.insert(path, new_edges);
    }

    pub fn remove_file(&self, path: &Path) {
        let path = path.to_path_buf();
        let mut g = self.inner.write().unwrap();
        purge_outgoing(&mut g, &path);
        g.all_md.remove(&path);
    }

    pub fn outgoing_links(&self, path: &Path) -> Vec<OutgoingLink> {
        let g = self.inner.read().unwrap();
        g.outgoing
            .get(path)
            .map(|edges| edges.iter().map(edge_to_dto).collect())
            .unwrap_or_default()
    }

    pub fn backlinks(&self, path: &Path) -> Vec<Backlink> {
        let g = self.inner.read().unwrap();
        g.incoming
            .get(path)
            .map(|list| {
                list.iter()
                    .filter(|b| b.source != *path)
                    .map(|b| Backlink {
                        source: b.source.to_string_lossy().into_owned(),
                        line: b.line,
                        snippet: b.snippet.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn broken_links(&self) -> Vec<BrokenLink> {
        let g = self.inner.read().unwrap();
        let mut out = Vec::new();
        for (source, edges) in g.outgoing.iter() {
            for e in edges {
                if let Some(ref t) = e.target {
                    if is_md(t) && !g.all_md.contains(t) {
                        out.push(BrokenLink {
                            source: source.to_string_lossy().into_owned(),
                            raw_href: e.raw_href.clone(),
                            line: e.line,
                            kind: e.kind,
                        });
                    }
                }
            }
        }
        out.sort_by(|a, b| a.source.cmp(&b.source).then(a.line.cmp(&b.line)));
        out
    }

    pub fn orphans(&self) -> Vec<String> {
        let g = self.inner.read().unwrap();
        let mut out = Vec::new();
        for md in g.all_md.iter() {
            // root-level files are entry-points, not orphans
            if let Some(ref root) = g.root {
                if md.parent().map(|p| p == root.as_path()).unwrap_or(false) {
                    continue;
                }
            }
            let referenced = g
                .incoming
                .get(md)
                .map(|list| list.iter().any(|b| &b.source != md))
                .unwrap_or(false);
            if !referenced {
                out.push(md.to_string_lossy().into_owned());
            }
        }
        out.sort();
        out
    }

    pub fn build_sync(&self) {
        let root = match self.root() {
            Some(r) => r,
            None => return,
        };
        let mut md_files = Vec::new();
        walk_md(&root, &root, &mut md_files, 0);
        for path in md_files {
            if let Ok(source) = std::fs::read_to_string(&path) {
                self.reindex_file(&path, &source);
            }
        }
    }
}

pub fn is_md(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

fn purge_outgoing(g: &mut GraphInner, path: &Path) {
    if let Some(old) = g.outgoing.remove(path) {
        for edge in old {
            if let Some(target) = edge.target {
                if let Some(list) = g.incoming.get_mut(&target) {
                    list.retain(|b| b.source != path);
                    if list.is_empty() {
                        g.incoming.remove(&target);
                    }
                }
            }
        }
    }
}

fn edge_to_dto(e: &LinkEdge) -> OutgoingLink {
    OutgoingLink {
        target: e.target.as_ref().map(|p| p.to_string_lossy().into_owned()),
        raw_href: e.raw_href.clone(),
        line: e.line,
        col: e.col,
        kind: e.kind,
        is_external: e.is_external,
    }
}

fn walk_md(root: &Path, dir: &Path, out: &mut Vec<PathBuf>, depth: u32) {
    if depth > MAX_WALK_DEPTH {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };
        if name.starts_with('.') {
            continue;
        }
        if IGNORED.contains(&name.as_str()) {
            continue;
        }
        if name.contains(".tmp.") {
            continue;
        }
        let path = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            walk_md(root, &path, out, depth + 1);
        } else if ft.is_file() && is_md(&path) {
            out.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> LinkGraph {
        let g = LinkGraph::new();
        g.set_root(Some(PathBuf::from("/proj")));
        g
    }

    #[test]
    fn outgoing_captured() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[b](./b.md)\n");
        let out = g.outgoing_links(&PathBuf::from("/proj/a.md"));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].target.as_deref(), Some("/proj/b.md"));
        assert!(!out[0].is_external);
    }

    #[test]
    fn backlinks_registered() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[b](./b.md)\n");
        g.reindex_file(&PathBuf::from("/proj/b.md"), "hello\n");
        let back = g.backlinks(&PathBuf::from("/proj/b.md"));
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].source, "/proj/a.md");
        assert_eq!(back[0].line, 1);
    }

    #[test]
    fn reindex_drops_stale_edges() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[b](./b.md)\n");
        g.reindex_file(&PathBuf::from("/proj/b.md"), "hi\n");
        g.reindex_file(&PathBuf::from("/proj/a.md"), "nothing here\n");
        assert!(g.backlinks(&PathBuf::from("/proj/b.md")).is_empty());
        assert!(g.outgoing_links(&PathBuf::from("/proj/a.md")).is_empty());
    }

    #[test]
    fn remove_file_cleans_up() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/sub/a.md"), "[b](./b.md)\n");
        g.reindex_file(&PathBuf::from("/proj/sub/b.md"), "hi\n");
        g.remove_file(&PathBuf::from("/proj/sub/a.md"));
        assert!(g.backlinks(&PathBuf::from("/proj/sub/b.md")).is_empty());
        assert!(g.outgoing_links(&PathBuf::from("/proj/sub/a.md")).is_empty());
        assert_eq!(g.orphans(), vec!["/proj/sub/b.md".to_string()]);
    }

    #[test]
    fn broken_md_detected() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[x](./nope.md)\n");
        let broken = g.broken_links();
        assert_eq!(broken.len(), 1);
        assert_eq!(broken[0].raw_href, "./nope.md");
        assert_eq!(broken[0].source, "/proj/a.md");
    }

    #[test]
    fn broken_ignores_external() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[x](https://example.com)\n");
        assert!(g.broken_links().is_empty());
    }

    #[test]
    fn broken_ignores_non_md_target() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "![x](./img.png)\n");
        assert!(g.broken_links().is_empty());
    }

    #[test]
    fn orphan_includes_unreferenced() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/sub/a.md"), "[b](./b.md)\n");
        g.reindex_file(&PathBuf::from("/proj/sub/b.md"), "hi\n");
        g.reindex_file(&PathBuf::from("/proj/sub/c.md"), "alone\n");
        assert_eq!(
            g.orphans(),
            vec!["/proj/sub/a.md".to_string(), "/proj/sub/c.md".to_string()]
        );
    }

    #[test]
    fn self_reference_ignored() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/sub/a.md"), "[self](./a.md)\n");
        assert!(g.backlinks(&PathBuf::from("/proj/sub/a.md")).is_empty());
        assert_eq!(g.orphans(), vec!["/proj/sub/a.md".to_string()]);
    }

    #[test]
    fn root_level_files_not_orphan() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/README.md"), "# root\n");
        g.reindex_file(&PathBuf::from("/proj/CLAUDE.md"), "# root\n");
        assert!(g.orphans().is_empty());
    }

    #[test]
    fn external_link_serialized() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[x](https://example.com)\n");
        let out = g.outgoing_links(&PathBuf::from("/proj/a.md"));
        assert_eq!(out.len(), 1);
        assert!(out[0].is_external);
        assert!(out[0].target.is_none());
    }

    #[test]
    fn reindex_noop_without_root() {
        let g = LinkGraph::new();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[b](./b.md)\n");
        assert!(g.outgoing_links(&PathBuf::from("/proj/a.md")).is_empty());
    }

    #[test]
    fn set_root_clears_state() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[b](./b.md)\n");
        g.set_root(Some(PathBuf::from("/other")));
        assert!(g.outgoing_links(&PathBuf::from("/proj/a.md")).is_empty());
        assert!(g.orphans().is_empty());
        assert!(g.broken_links().is_empty());
    }

    #[test]
    fn unresolved_target_not_broken_not_external() {
        let g = setup();
        g.reindex_file(&PathBuf::from("/proj/a.md"), "[x](#anchor)\n");
        let out = g.outgoing_links(&PathBuf::from("/proj/a.md"));
        assert_eq!(out.len(), 1);
        assert!(out[0].target.is_none());
        assert!(!out[0].is_external);
        assert!(g.broken_links().is_empty());
    }
}

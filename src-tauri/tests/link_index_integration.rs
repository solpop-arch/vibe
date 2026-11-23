use std::fs;
use std::path::PathBuf;

use vibe_lib::link_index::LinkGraph;

fn fresh_tmp(label: &str) -> PathBuf {
    let pid = std::process::id();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("vibe-link-test-{}-{}-{}", label, pid, ts));
    if dir.exists() {
        fs::remove_dir_all(&dir).ok();
    }
    fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

fn write(root: &PathBuf, rel: &str, contents: &str) -> PathBuf {
    let full = root.join(rel);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(&full, contents).unwrap();
    full.canonicalize().unwrap()
}

#[test]
fn build_sync_populates_graph_from_disk() {
    let root = fresh_tmp("build");

    let index = write(&root, "index.md", "See [guide](./docs/guide.md) and [missing](./nope.md).\n");
    let guide = write(&root, "docs/guide.md", "Back to [home](../index.md). External: <https://example.com>.\n");
    let _orphan = write(&root, "docs/alone.md", "Nobody links to me.\n");

    let graph = LinkGraph::new();
    graph.set_root(Some(root.clone()));
    graph.build_sync();

    let outgoing = graph.outgoing_links(&index);
    assert_eq!(outgoing.len(), 2, "index.md should have 2 outgoing");
    let guide_edge = outgoing.iter().find(|e| e.raw_href == "./docs/guide.md").unwrap();
    assert_eq!(guide_edge.target.as_deref(), Some(guide.to_string_lossy().as_ref()));
    assert!(!guide_edge.is_external);

    let back = graph.backlinks(&guide);
    assert_eq!(back.len(), 1);
    assert_eq!(back[0].source, index.to_string_lossy());

    let broken = graph.broken_links();
    assert_eq!(broken.len(), 1, "broken should be the ./nope.md link");
    assert_eq!(broken[0].raw_href, "./nope.md");

    let orphans = graph.orphans();
    assert!(
        orphans.iter().any(|p| p.ends_with("docs/alone.md")),
        "alone.md should be orphan, got: {:?}",
        orphans
    );
    // index.md is referenced by guide.md → not orphan
    assert!(
        !orphans.iter().any(|p| p.ends_with("/index.md")),
        "index.md should not be orphan: {:?}",
        orphans
    );

    fs::remove_dir_all(&root).ok();
}

#[test]
fn ignored_dirs_skipped() {
    let root = fresh_tmp("ignored");

    let _ = write(&root, "docs/real.md", "hello\n");
    let _ = write(&root, "node_modules/fake.md", "[x](../docs/real.md)\n");
    let _ = write(&root, ".git/HEAD", "ref: refs/heads/main\n");

    let graph = LinkGraph::new();
    graph.set_root(Some(root.clone()));
    graph.build_sync();

    assert_eq!(graph.orphans(), vec![root.join("docs/real.md").to_string_lossy().into_owned()]);
    assert!(graph.broken_links().is_empty());

    fs::remove_dir_all(&root).ok();
}

#[test]
fn incremental_reindex_after_edit() {
    let root = fresh_tmp("edit");

    let a = write(&root, "a.md", "[b](./b.md)\n");
    let b = write(&root, "b.md", "hi\n");

    let graph = LinkGraph::new();
    graph.set_root(Some(root.clone()));
    graph.build_sync();
    assert_eq!(graph.backlinks(&b).len(), 1);

    fs::write(&a, "no links now\n").unwrap();
    let updated = fs::read_to_string(&a).unwrap();
    graph.reindex_file(&a, &updated);

    assert!(graph.backlinks(&b).is_empty());

    fs::remove_dir_all(&root).ok();
}

#[test]
fn remove_turns_incoming_into_broken() {
    let root = fresh_tmp("remove");

    let a = write(&root, "a.md", "[b](./b.md)\n");
    let b = write(&root, "b.md", "hi\n");

    let graph = LinkGraph::new();
    graph.set_root(Some(root.clone()));
    graph.build_sync();
    assert!(graph.broken_links().is_empty());

    graph.remove_file(&b);
    let broken = graph.broken_links();
    assert_eq!(broken.len(), 1);
    assert_eq!(broken[0].source, a.to_string_lossy());
    assert_eq!(broken[0].raw_href, "./b.md");

    fs::remove_dir_all(&root).ok();
}

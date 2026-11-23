import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// In-file search state. Plain files are searched line by line here; markdown files
// report their match count through `setMdMatchCount` (MarkdownView highlights itself).
export function useFileSearch({ content, isMd, listRef, openSearchRef, closeSearchRef }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)
  const [mdMatchCount, setMdMatchCount] = useState(0)
  const searchInputRef = useRef(null)

  const searchMatches = useMemo(() => {
    if (!searchQuery || !content || isMd) return []
    const q = searchQuery.toLowerCase()
    const lines = content.split('\n')
    const matches = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) matches.push(i)
    }
    return matches
  }, [searchQuery, content, isMd])

  const totalMatches = isMd ? mdMatchCount : searchMatches.length

  useEffect(() => {
    if (totalMatches === 0) setCurrentMatchIdx(0)
    else if (currentMatchIdx >= totalMatches) setCurrentMatchIdx(0)
  }, [totalMatches])

  useEffect(() => {
    if (isMd) return
    if (searchMatches.length > 0 && listRef.current) {
      listRef.current.scrollToRow({ index: searchMatches[currentMatchIdx], align: 'center' })
    }
  }, [currentMatchIdx, searchMatches, isMd])

  const searchNext = useCallback(() => {
    if (totalMatches === 0) return
    setCurrentMatchIdx(i => (i + 1) % totalMatches)
  }, [totalMatches])

  const searchPrev = useCallback(() => {
    if (totalMatches === 0) return
    setCurrentMatchIdx(i => (i - 1 + totalMatches) % totalMatches)
  }, [totalMatches])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [])

  // Expose openSearch to parent via ref
  useEffect(() => {
    if (openSearchRef) openSearchRef.current = openSearch
  }, [openSearchRef, openSearch])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setCurrentMatchIdx(0)
  }, [])

  // Expose "close if open" so the parent's Esc path can swallow before closing the file
  useEffect(() => {
    if (!closeSearchRef) return
    closeSearchRef.current = () => {
      if (!searchOpen) return false
      closeSearch()
      return true
    }
  }, [closeSearchRef, searchOpen, closeSearch])

  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches])
  const currentMatchLine = searchMatches.length > 0 ? searchMatches[currentMatchIdx] : -1

  return {
    searchOpen, searchQuery, setSearchQuery, currentMatchIdx, setCurrentMatchIdx,
    setMdMatchCount, totalMatches, searchInputRef,
    searchNext, searchPrev, openSearch, closeSearch,
    searchMatchSet, currentMatchLine,
  }
}

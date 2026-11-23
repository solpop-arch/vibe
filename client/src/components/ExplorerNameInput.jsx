import { getIndent, FONT_UI } from '../constants'

const ExplorerNameInput = ({ inputRef, depth, value, onChange, onSubmit, onCancel }) => (
  <form onSubmit={onSubmit} style={{ padding:`4px 16px 4px ${getIndent(depth)}px` }}>
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onCancel}
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
      style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--accent)', color:'var(--text)', fontSize:'13px', padding:'1px 6px', borderRadius:'4px', outline:'none', fontFamily:FONT_UI }}
    />
  </form>
)

export default ExplorerNameInput

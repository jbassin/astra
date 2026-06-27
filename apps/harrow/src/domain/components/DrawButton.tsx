// Ported from harrow's src/components/DrawButton.tsx, re-skinned onto gothic
// (brass→accent-amber; the custom glow utility dropped).
interface DrawButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

export function DrawButton({ onClick, disabled = false, label = "Draw Cards" }: DrawButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-8 py-3 rounded-xl border border-accent-amber/50 bg-accent-amber/10 text-accent-amber font-display font-semibold tracking-widest uppercase text-sm transition-all duration-150 hover:bg-accent-amber/20 hover:border-accent-amber/80 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

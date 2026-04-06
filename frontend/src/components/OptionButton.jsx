export default function OptionButton({ label, selected, onClick }) {
  return (
    <button
      className={`option-btn${selected ? " selected" : ""}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

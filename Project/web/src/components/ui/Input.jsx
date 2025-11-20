export default function Input({ label, ...props }) {
  return (
    <div className="flex flex-col mb-3">
      {label && <label className="mb-1 text-sm text-gray-600">{label}</label>}
      <input
        className="border p-2 rounded"
        {...props}
      />
    </div>
  );
}
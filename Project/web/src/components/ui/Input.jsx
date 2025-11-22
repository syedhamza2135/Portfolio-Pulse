export default function Input({ 
  label, 
  error, 
  helperText,
  required = false,
  id,
  className = "",
  ...props 
}) {
  const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      
      <input
        id={inputId}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        required={required}
        className={`
          block w-full rounded-lg border px-3 py-2 text-sm
          placeholder:text-gray-400
          focus:outline-none focus:ring-2 focus:ring-offset-0
          disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
          transition-colors duration-150
          ${error 
            ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-300' 
            : 'border-gray-300 text-gray-900 focus:border-sky-500 focus:ring-sky-300'
          }
          ${className}
        `}
        {...props}
      />
      
      {error && (
        <p 
          id={`${inputId}-error`}
          className="mt-1.5 text-sm text-red-600"
        >
          {error}
        </p>
      )}
      
      {!error && helperText && (
        <p 
          id={`${inputId}-helper`}
          className="mt-1.5 text-sm text-gray-500"
        >
          {helperText}
        </p>
      )}
    </div>
  );
}
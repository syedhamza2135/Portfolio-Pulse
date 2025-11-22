export default function Button({ 
  children, 
  variant = "primary", 
  size = "md",
  fullWidth = false,
  disabled = false,
  type = "button",
  className = "",
  ...props 
}) {
  const baseStyles = `
    inline-flex items-center justify-center font-semibold
    rounded-lg transition-all duration-150
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variantStyles = {
    primary: `
      bg-sky-600 text-white
      hover:bg-sky-700 active:bg-sky-800
      focus:ring-sky-500
    `,
    secondary: `
      bg-gray-200 text-gray-900
      hover:bg-gray-300 active:bg-gray-400
      focus:ring-gray-400
    `,
    danger: `
      bg-red-600 text-white
      hover:bg-red-700 active:bg-red-800
      focus:ring-red-500
    `,
    outline: `
      border-2 border-gray-300 text-gray-700 bg-white
      hover:bg-gray-50 active:bg-gray-100
      focus:ring-gray-400
    `,
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={`
        ${baseStyles}
        ${variantStyles[variant] || variantStyles.primary}
        ${sizeStyles[size] || sizeStyles.md}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
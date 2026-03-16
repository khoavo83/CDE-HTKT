/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: ['class'],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                }
            },
            keyframes: {
                slideDown: {
                    '0%': { opacity: '0', transform: 'translate(-50%, -20px)' },
                    '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
                },
            },
            animation: {
                slideDown: 'slideDown 0.3s ease-out',
            },
        },
    },
    plugins: [],
}

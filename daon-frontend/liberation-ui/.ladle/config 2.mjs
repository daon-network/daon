/** @type {import('@ladle/react').UserConfig} */
export default {
  title: "Liberation UI - Component Library",
  base: "/",
  stories: "src/**/*.stories.{js,jsx,ts,tsx}",
  addons: {
    theme: {
      themes: [
        {
          name: "Liberation Light",
          colors: {
            primary: "#3B82F6",
            secondary: "#10B981",  
            text: "#1F2937",
            background: "#FFFFFF",
          },
        },
        {
          name: "Liberation Dark",
          colors: {
            primary: "#60A5FA",
            secondary: "#34D399",
            text: "#F9FAFB",
            background: "#111827",
          },
        },
      ],
    },
  },
  viteConfig: "./.ladle/vite.config.ts",
};

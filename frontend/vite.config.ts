import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    proxy: {
      "/exams": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/interview": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/sessions": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/code": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/execution": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/evaluations": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/resumes": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/files": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/blueprint": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/speech": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
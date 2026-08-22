import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	worker: {
		// Keep pdf.js out of the inspection worker's eager graph so the browser
		// fetches parser chunks only when a selected document needs them.
		format: "es",
	},
});


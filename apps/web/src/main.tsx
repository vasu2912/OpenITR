import "@patternfly/react-core/dist/styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import {
	AppErrorBoundary,
	isAppPath,
	NotFoundPage,
} from "./app/fallback-pages";
import "./theme.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
	throw new Error("OpenITR application root is missing");
}

createRoot(rootElement).render(
	<StrictMode>
		<AppErrorBoundary>
			{isAppPath(window.location.pathname) ? <App /> : <NotFoundPage />}
		</AppErrorBoundary>
	</StrictMode>,
);

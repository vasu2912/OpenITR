import {
	Button,
	Content,
	EmptyState,
	EmptyStateActions,
	EmptyStateBody,
	EmptyStateFooter,
} from "@patternfly/react-core";
import SearchIcon from "@patternfly/react-icons/dist/esm/icons/search-icon";
import type { ReactNode } from "react";
import { Component } from "react";

import { StandaloneFrame } from "./app-frame";

// The analysis is a single page. Vite and `vite preview` serve it at `/`,
// and the deployed site serves it at `/app/`.
const appPaths = new Set([
	"/",
	"/index.html",
	"/app",
	"/app/",
	"/app/index.html",
]);

export const isAppPath = (pathname: string): boolean => appPaths.has(pathname);

const appHref = (): string =>
	window.location.pathname.startsWith("/app") ? "/app/" : "/";

export const NotFoundPage = () => (
	<StandaloneFrame title="Page not found">
		<EmptyState
			headingLevel="h1"
			icon={SearchIcon}
			titleText="This page does not exist"
			variant="lg"
		>
			<EmptyStateBody>
				Check the address for typos. The analysis runs on a single page.
			</EmptyStateBody>
			<EmptyStateFooter>
				<EmptyStateActions>
					<Button component="a" href="/app/" variant="primary">
						Open the analysis
					</Button>
				</EmptyStateActions>
				<EmptyStateActions>
					<Button component="a" href="/" variant="link">
						Go to the homepage
					</Button>
				</EmptyStateActions>
			</EmptyStateFooter>
		</EmptyState>
	</StandaloneFrame>
);

const CrashPage = () => (
	<StandaloneFrame title="Something went wrong">
		<EmptyState
			headingLevel="h1"
			status="danger"
			titleText="Something went wrong"
			variant="lg"
		>
			<EmptyStateBody>
				OpenITR hit an unexpected problem and stopped this session. Your answers
				were held only in this tab, so starting again begins a fresh analysis.
				Your original files are untouched.
			</EmptyStateBody>
			<EmptyStateFooter>
				<EmptyStateActions>
					<Button
						onClick={() => window.location.assign(appHref())}
						variant="primary"
					>
						Start a new analysis
					</Button>
				</EmptyStateActions>
				<EmptyStateActions>
					<Button
						component="a"
						href="https://github.com/vasu2912/OpenITR/issues"
						rel="noreferrer"
						target="_blank"
						variant="link"
					>
						Report the problem
					</Button>
				</EmptyStateActions>
				<Content component="small">
					Describe what you clicked. Never attach tax documents, PANs, or other
					personal details.
				</Content>
			</EmptyStateFooter>
		</EmptyState>
	</StandaloneFrame>
);

type ErrorBoundaryState = Readonly<{ hasError: boolean }>;

export class AppErrorBoundary extends Component<
	Readonly<{ children: ReactNode }>,
	ErrorBoundaryState
> {
	override state: ErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasError: true };
	}

	override render(): ReactNode {
		return this.state.hasError ? <CrashPage /> : this.props.children;
	}
}

import {
	Button,
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@patternfly/react-core";
import { useCallback, useEffect, useRef, useState } from "react";

// Every way out of a session that throws away in-memory answers.
export type SessionExit =
	| Readonly<{ kind: "reset" }>
	| Readonly<{ kind: "reload" }>
	| Readonly<{ kind: "navigate"; href: string }>;

const exitCopy = {
	reset: {
		title: "Reset this session?",
		action: "Reset session",
		body: "Resetting discards your answers and documents. OpenITR keeps them nowhere else, so you cannot undo this.",
	},
	reload: {
		title: "Reload and lose this session?",
		action: "Reload and discard",
		body: "Reloading discards your answers and documents. OpenITR keeps them nowhere else, so you will start again from the first question.",
	},
	navigate: {
		title: "Leave and lose this session?",
		action: "Leave and discard",
		body: "Leaving discards your answers and documents. OpenITR keeps them nowhere else, so you will start again from the first question.",
	},
} as const satisfies Record<
	SessionExit["kind"],
	Readonly<{ title: string; action: string; body: string }>
>;

const isReloadShortcut = (event: KeyboardEvent): boolean =>
	event.key === "F5" ||
	((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r");

/**
 * Guards a session that holds unsaved work.
 *
 * Reload shortcuts (F5, Ctrl+R, Cmd+R) and in-app links open the session
 * dialog. Browsers never let a page draw its own dialog for the toolbar
 * reload button or for closing the tab, so those fall back to the browser's
 * native "Leave site?" prompt.
 */
export const useSessionExitGuard = ({
	hasWorkToLose,
	onReset,
}: Readonly<{ hasWorkToLose: boolean; onReset: () => void }>) => {
	const [pendingExit, setPendingExit] = useState<SessionExit>();
	const isLeavingOnPurpose = useRef(false);

	useEffect(() => {
		if (!hasWorkToLose) return;
		const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
			if (!isLeavingOnPurpose.current) event.preventDefault();
		};
		const interceptReload = (event: KeyboardEvent): void => {
			if (!isReloadShortcut(event)) return;
			event.preventDefault();
			setPendingExit({ kind: "reload" });
		};
		window.addEventListener("beforeunload", warnBeforeUnload);
		window.addEventListener("keydown", interceptReload);
		return () => {
			window.removeEventListener("beforeunload", warnBeforeUnload);
			window.removeEventListener("keydown", interceptReload);
		};
	}, [hasWorkToLose]);

	const requestExit = useCallback(
		(exit: SessionExit): void => {
			if (hasWorkToLose || exit.kind === "reset") {
				setPendingExit(exit);
				return;
			}
			if (exit.kind === "navigate") window.location.assign(exit.href);
			else window.location.reload();
		},
		[hasWorkToLose],
	);

	const confirmExit = (): void => {
		const exit = pendingExit;
		setPendingExit(undefined);
		if (exit === undefined) return;
		switch (exit.kind) {
			case "reset":
				onReset();
				return;
			case "reload":
				isLeavingOnPurpose.current = true;
				window.location.reload();
				return;
			case "navigate":
				isLeavingOnPurpose.current = true;
				window.location.assign(exit.href);
				return;
			default:
				exit satisfies never;
		}
	};

	const dialog =
		pendingExit === undefined ? null : (
			<SessionExitDialog
				exit={pendingExit}
				onCancel={() => setPendingExit(undefined)}
				onConfirm={confirmExit}
			/>
		);

	return { dialog, requestExit };
};

const SessionExitDialog = ({
	exit,
	onCancel,
	onConfirm,
}: Readonly<{
	exit: SessionExit;
	onCancel: () => void;
	onConfirm: () => void;
}>) => {
	const copy = exitCopy[exit.kind];
	return (
		<Modal
			aria-describedby="session-exit-body"
			aria-labelledby="session-exit-title"
			isOpen
			onClose={onCancel}
			variant="small"
		>
			<ModalHeader
				labelId="session-exit-title"
				title={copy.title}
				titleIconVariant="warning"
			/>
			<ModalBody id="session-exit-body">{copy.body}</ModalBody>
			<ModalFooter>
				<Button onClick={onConfirm} variant="danger">
					{copy.action}
				</Button>
				<Button onClick={onCancel} variant="link">
					Cancel
				</Button>
			</ModalFooter>
		</Modal>
	);
};

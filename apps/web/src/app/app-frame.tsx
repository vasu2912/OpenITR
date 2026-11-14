import {
	Button,
	Content,
	Flex,
	HelperText,
	HelperTextItem,
	Label,
	LabelGroup,
	Masthead,
	MastheadBrand,
	MastheadContent,
	MastheadLogo,
	MastheadMain,
	MastheadToggle,
	Nav,
	NavGroup,
	NavItem,
	Page,
	PageContext,
	PageSection,
	PageSidebar,
	PageSidebarBody,
	PageToggleButton,
	Stack,
	Tab,
	Tabs,
	TabTitleText,
	Title,
	Toolbar,
	ToolbarContent,
	ToolbarItem,
} from "@patternfly/react-core";
import ArrowLeftIcon from "@patternfly/react-icons/dist/esm/icons/arrow-left-icon";
import ArrowRightIcon from "@patternfly/react-icons/dist/esm/icons/arrow-right-icon";
import ExternalLinkAltIcon from "@patternfly/react-icons/dist/esm/icons/external-link-alt-icon";
import LockIcon from "@patternfly/react-icons/dist/esm/icons/lock-icon";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useContext, useEffect } from "react";

import { activeAnalysisRelease } from "./release-manifest";
import {
	pageForTarget,
	pageIndexOf,
	type ScopeStatus,
	type WorkflowPageId,
	workflowPages,
	workflowStages,
} from "./workflow";

const BrandLogo = ({
	onNavigate,
}: Readonly<{ onNavigate?: ((href: string) => void) | undefined }>) => (
	<MastheadLogo
		component="a"
		href="/"
		onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
			if (onNavigate === undefined) return;
			event.preventDefault();
			onNavigate("/");
		}}
	>
		<span aria-hidden="true" className="openitr-brand-mark">
			O/
		</span>
		<span className="openitr-brand-name">OpenITR</span>
	</MastheadLogo>
);

const ReleaseLabels = () => (
	<LabelGroup aria-label="Analysis release" numLabels={3}>
		<Label isCompact variant="outline">
			{activeAnalysisRelease.form}
		</Label>
		<Label isCompact variant="outline">
			FY {activeAnalysisRelease.financialYear}
		</Label>
		<Label isCompact variant="outline">
			AY {activeAnalysisRelease.assessmentYear}
		</Label>
	</LabelGroup>
);

const AppMasthead = ({
	actions,
	hasToggle,
	onNavigate,
}: Readonly<{
	actions?: ReactNode;
	hasToggle: boolean;
	onNavigate?: ((href: string) => void) | undefined;
}>) => (
	<Masthead>
		<MastheadMain>
			{hasToggle ? (
				<MastheadToggle>
					<PageToggleButton
						aria-label="Analysis workflow navigation"
						isHamburgerButton
					/>
				</MastheadToggle>
			) : null}
			<MastheadBrand>
				<BrandLogo onNavigate={onNavigate} />
			</MastheadBrand>
		</MastheadMain>
		<MastheadContent>
			<Toolbar isFullHeight>
				<ToolbarContent>
					<ToolbarItem visibility={{ default: "hidden", md: "visible" }}>
						<ReleaseLabels />
					</ToolbarItem>
					{actions === undefined ? null : (
						<ToolbarItem align={{ default: "alignEnd" }}>{actions}</ToolbarItem>
					)}
				</ToolbarContent>
			</Toolbar>
		</MastheadContent>
	</Masthead>
);

const WorkflowNav = ({
	activeStageIndex,
	onSelectPage,
	scopeStatus,
}: Readonly<{
	activeStageIndex: number;
	onSelectPage: ((pageId: WorkflowPageId) => void) | undefined;
	scopeStatus: ScopeStatus;
}>) => {
	const page = useContext(PageContext);
	return (
		<Nav aria-label="Analysis workflow">
			<NavGroup title="Your analysis">
				{workflowStages.map((stage, stageIndex) => {
					const isBlocked = stage.id === "scope" && scopeStatus === "blocked";
					return (
						<NavItem
							component="button"
							id={`workflow-step-${stage.id}`}
							isActive={stageIndex === activeStageIndex}
							itemId={stage.id}
							key={stage.id}
							onClick={() => {
								if (onSelectPage === undefined) return;
								onSelectPage(stage.pages[0].id);
								if (page.isMobile) page.onSidebarToggle();
							}}
						>
							<Flex
								alignItems={{ default: "alignItemsCenter" }}
								spaceItems={{ default: "spaceItemsSm" }}
							>
								<span>
									{stageIndex + 1}. {stage.label}
								</span>
								{isBlocked ? (
									<Label isCompact status="danger">
										Needs attention
									</Label>
								) : null}
							</Flex>
						</NavItem>
					);
				})}
			</NavGroup>
		</Nav>
	);
};

const repositoryUrl = "https://github.com/vasu2912/OpenITR";

const SidebarFooter = () => (
	<Stack hasGutter>
		<HelperText>
			<HelperTextItem icon={<LockIcon />}>
				Everything stays in this tab. Nothing is uploaded.
			</HelperTextItem>
		</HelperText>
		<Content component="small">
			Rule pack {activeAnalysisRelease.rulePackRevision}
			<br />
			Made by Vasu ·{" "}
			<Button
				component="a"
				href={repositoryUrl}
				icon={<ExternalLinkAltIcon />}
				iconPosition="end"
				isInline
				rel="noreferrer"
				target="_blank"
				variant="link"
			>
				GitHub
			</Button>
		</Content>
	</Stack>
);

export const AppFrame = ({
	activePageId = "scope-questions",
	children,
	onNavigateAway,
	onSelectPage,
	scopeStatus,
	sessionActions,
}: Readonly<{
	activePageId?: WorkflowPageId;
	children: ReactNode;
	onNavigateAway?: (href: string) => void;
	onSelectPage?: (pageId: WorkflowPageId) => void;
	scopeStatus: ScopeStatus;
	sessionActions?: ReactNode;
}>) => {
	const activeIndex = pageIndexOf(activePageId);
	const activePage = workflowPages[activeIndex];
	if (activePage === undefined) {
		throw new Error(`Unknown workflow page: ${activePageId}`);
	}
	const activeStageIndex = workflowStages.findIndex(
		(stage) => stage.id === activePage.stage.id,
	);
	const previousPage = workflowPages[activeIndex - 1];
	const nextPage = workflowPages[activeIndex + 1];

	useEffect(() => {
		document.title = `${activePage.title} · Step ${activeStageIndex + 1} of ${workflowStages.length} · OpenITR`;
	}, [activePage.title, activeStageIndex]);

	const selectPage = (pageId: WorkflowPageId): void => {
		onSelectPage?.(pageId);
		document.getElementById("openitr-main")?.scrollTo({ top: 0 });
	};

	const handleInternalLink = (event: ReactMouseEvent<HTMLElement>): void => {
		if (!(event.target instanceof Element)) return;
		const href = event.target.closest('a[href^="#"]')?.getAttribute("href");
		if (href === null || href === undefined) return;
		const targetId = decodeURIComponent(href.slice(1));
		const targetPage = pageForTarget(targetId);
		if (targetPage === undefined || onSelectPage === undefined) return;
		event.preventDefault();
		window.history.replaceState(null, "", href);
		onSelectPage(targetPage);
		window.requestAnimationFrame(() => {
			document.getElementById(targetId)?.scrollIntoView({ block: "center" });
		});
	};

	const sidebar = (
		<PageSidebar>
			<PageSidebarBody isFilled>
				<WorkflowNav
					activeStageIndex={activeStageIndex}
					onSelectPage={onSelectPage === undefined ? undefined : selectPage}
					scopeStatus={scopeStatus}
				/>
			</PageSidebarBody>
			<PageSidebarBody className="openitr-sidebar-footer">
				<SidebarFooter />
			</PageSidebarBody>
		</PageSidebar>
	);

	const hasTabs =
		activePage.stage.pages.length > 1 && onSelectPage !== undefined;

	return (
		<Page
			defaultManagedSidebarIsOpen
			isManagedSidebar
			mainContainerId="openitr-main"
			masthead={
				<AppMasthead
					actions={sessionActions}
					hasToggle
					onNavigate={onNavigateAway}
				/>
			}
			onClick={handleInternalLink}
			sidebar={sidebar}
		>
			<PageSection
				className="openitr-page-header"
				hasBodyWrapper={false}
				isWidthLimited
			>
				<Stack>
					<Flex
						alignItems={{ default: "alignItemsBaseline" }}
						columnGap={{ default: "columnGapMd" }}
					>
						<Title headingLevel="h1" size="xl">
							{activePage.title}
						</Title>
						<Content component="small">
							Step {activeStageIndex + 1} of {workflowStages.length} ·{" "}
							{activePage.stage.label}
						</Content>
					</Flex>
					<Content className="openitr-page-description" component="small">
						{activePage.description}
					</Content>
					{hasTabs ? (
						<Tabs
							activeKey={activePageId}
							aria-label={`${activePage.stage.label} sections`}
							inset={{ default: "insetNone" }}
							onSelect={(_event, key) => {
								const page = workflowPages.find(({ id }) => id === key);
								if (page !== undefined) selectPage(page.id);
							}}
						>
							{activePage.stage.pages.map((page) => (
								<Tab
									eventKey={page.id}
									key={page.id}
									title={<TabTitleText>{page.tabLabel}</TabTitleText>}
								/>
							))}
						</Tabs>
					) : null}
				</Stack>
			</PageSection>
			<PageSection className="openitr-content" isFilled isWidthLimited>
				{children}
			</PageSection>
			{onSelectPage === undefined ? null : (
				<PageSection
					className="openitr-pager"
					hasShadowTop
					isFilled={false}
					isWidthLimited
					stickyOnBreakpoint={{ default: "bottom" }}
				>
					<Flex
						alignItems={{ default: "alignItemsCenter" }}
						justifyContent={{ default: "justifyContentSpaceBetween" }}
					>
						{previousPage === undefined ? (
							<span />
						) : (
							<Button
								icon={<ArrowLeftIcon />}
								onClick={() => selectPage(previousPage.id)}
								variant="link"
							>
								Back
							</Button>
						)}
						{nextPage === undefined ? (
							<Content component="small">End of the analysis</Content>
						) : (
							<Button
								icon={<ArrowRightIcon />}
								iconPosition="end"
								onClick={() => selectPage(nextPage.id)}
								variant="primary"
							>
								Next:{" "}
								{nextPage.stage.id === activePage.stage.id
									? nextPage.tabLabel
									: nextPage.stage.label}
							</Button>
						)}
					</Flex>
				</PageSection>
			)}
		</Page>
	);
};

// Frame for pages outside the workflow: not found and unexpected errors.
export const StandaloneFrame = ({
	children,
	title,
}: Readonly<{ children: ReactNode; title: string }>) => {
	useEffect(() => {
		document.title = `${title} · OpenITR`;
	}, [title]);
	return (
		<Page
			mainContainerId="openitr-main"
			masthead={<AppMasthead hasToggle={false} />}
		>
			<PageSection isFilled>{children}</PageSection>
		</Page>
	);
};

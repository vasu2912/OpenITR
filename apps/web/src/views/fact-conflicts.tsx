import type { CandidateDocument } from "@openitr/model";
import type {
	FactResolution,
	UnresolvedFactConflict,
} from "@openitr/fact-reconciliation";
import {
	Alert,
	Button,
	Card,
	CardBody,
	CardTitle,
	Radio,
	TextArea,
	Title,
} from "@patternfly/react-core";
import { useState } from "react";
import type { FormEvent } from "react";

import type { SessionOrchestrator } from "../session/session-orchestrator";

const shortDigest = (digest: string): string => `${digest.slice(0, 12)}…`;

const rupeeText = (value: string): string => {
	const [wholePart, fractionPart] = value.split(".");
	const whole = Number(wholePart ?? "0").toLocaleString("en-IN");
	return fractionPart === undefined
		? `₹ ${whole}`
		: `₹ ${whole}.${fractionPart}`;
};

// One conflict's resolution form. The taxpayer either selects one offered
// observation or attests a permitted amount; either way a reason is owed.
const ConflictForm = ({
	conflict,
	documents,
	session,
}: Readonly<{
	conflict: UnresolvedFactConflict;
	documents: readonly CandidateDocument[];
	session: SessionOrchestrator;
}>) => {
	const displayNameOf = (documentId: string): string =>
		documents.find(
			(candidate) => String(candidate.documentId) === documentId,
		)?.displayName ?? `Document ${shortDigest(documentId)}`;

	const [selectedObservationId, setSelectedObservationId] = useState<string>();
	const [attestSelected, setAttestSelected] = useState(false);
	const [attestedValue, setAttestedValue] = useState("");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string>();

	const attestedAmountIsValid =
		attestedValue.trim().length > 0 &&
		Number.isFinite(Number(attestedValue)) &&
		Number(attestedValue) >= 0;

	const canSubmit =
		reason.trim().length > 0 &&
		(attestSelected
			? attestedAmountIsValid
			: selectedObservationId !== undefined);

	const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (!canSubmit) {
			setError(
				reason.trim().length === 0
					? "A reason is required so the analysis can show why this value was chosen."
					: attestSelected
						? "Enter the attested amount as a non-negative number."
						: "Select one source's value to resolve this conflict.",
			);
			return;
		}
		try {
			session.send({
				kind: "resolve-fact-conflict",
				groupId: conflict.groupId,
				choice: attestSelected
					? { kind: "attested", value: attestedValue.trim() }
					: { kind: "observed", observationId: selectedObservationId ?? "" },
				reason: reason.trim(),
				executionContext: { recordedAt: new Date().toISOString() },
			});
		} catch (submitError: unknown) {
			setError(
				submitError instanceof Error
					? submitError.message
					: "The resolution was refused.",
			);
		}
	};

	return (
		<form
			aria-label={`Resolve the ${String(conflict.factKey)} conflict`}
			onSubmit={handleSubmit}
		>
			<fieldset className="openitr-conflict-options">
				<legend>Decide one value for this fact</legend>
				{conflict.candidates.map((candidate) => (
					<Radio
						id={`${conflict.conflictId}-${candidate.observationId}`}
						isChecked={
							!attestSelected && selectedObservationId === candidate.observationId
						}
						key={candidate.observationId}
						label={`${rupeeText(candidate.value)} — ${displayNameOf(String(candidate.sourceDocumentId))}`}
						name={`resolve-${conflict.conflictId}`}
						onChange={() => {
							setAttestSelected(false);
							setSelectedObservationId(candidate.observationId);
							setError(undefined);
						}}
						value={candidate.observationId}
					/>
				))}
				{conflict.attestationPermitted ? (
					<span className="openitr-conflict-attest">
						<Radio
							id={`${conflict.conflictId}-attest`}
							isChecked={attestSelected}
							label="Attest the correct amount instead"
							name={`resolve-${conflict.conflictId}`}
							onChange={() => {
								setAttestSelected(true);
								setError(undefined);
							}}
							value="attest"
						/>
						{attestSelected ? (
							<label className="openitr-conflict-attest-input">
								Attested amount
								<input
									aria-label="Attested amount in rupees"
									inputMode="decimal"
									onChange={(event) => setAttestedValue(event.target.value)}
									placeholder="e.g. 8450"
									type="text"
									value={attestedValue}
								/>
							</label>
						) : null}
					</span>
				) : null}
			</fieldset>
			<label className="openitr-conflict-reason">
				Reason for this resolution (required)
				<TextArea
					aria-label="Reason for this resolution"
					onChange={(_event, value) => {
						setReason(value);
						setError(undefined);
					}}
					placeholder="Say why this value is right, e.g. which statement you checked."
					resizeOrientation="vertical"
					value={reason}
				/>
			</label>
			{error ? (
				<Alert
					isInline
					isPlain
					className="openitr-conflict-error"
					title={error}
					variant="danger"
				/>
			) : null}
			<Button type="submit" variant="primary">
				Record resolution
			</Button>
			<p className="openitr-conflict-note">
				Recording a resolution keeps every original observation and its
				evidence unchanged. The estimate then uses only your decided value.
			</p>
		</form>
	);
};

export const FactConflictsView = ({
	session,
	documents,
	conflicts,
	resolutions,
}: Readonly<{
	session: SessionOrchestrator;
	documents: readonly CandidateDocument[];
	conflicts: readonly UnresolvedFactConflict[];
	resolutions: readonly FactResolution[];
}>) => {
	if (conflicts.length === 0 && resolutions.length === 0) {
		return null;
	}

	return (
		<Card
			aria-live="polite"
			className="openitr-conflicts-card"
			component="section"
		>
			<CardTitle>
				<Title headingLevel="h2" size="lg">
					Cross-source conflicts
				</Title>
			</CardTitle>
			<CardBody>
				{conflicts.length > 0 ? (
					<Alert
						isInline
						title={`${conflicts.length} unresolved ${
							conflicts.length === 1 ? "conflict" : "conflicts"
						} blocking affected results below`}
						variant="warning"
					>
						Sources disagree about the same fact. Nothing is edited or
						deleted: pick the value you can stand behind, or attest it, and
						say why.
					</Alert>
				) : (
					<Alert
						isInline
						title="Every conflict has a recorded resolution"
						variant="success"
					>
						The original observations stay listed in the evidence review
						below.
					</Alert>
				)}

				<ul className="openitr-conflict-list">
					{conflicts.map((conflict) => (
						<li
							className="openitr-conflict-item"
							data-fact-key={String(conflict.factKey)}
							key={conflict.conflictId}
						>
							<h3 className="openitr-conflict-heading">
								<code>{String(conflict.factKey)}</code>
							</h3>
							{conflict.affectedResults.length > 0 ? (
								<p className="openitr-conflict-affected">
									Affects:{" "}
									{conflict.affectedResults
										.map((result) => result.label)
										.join(", ")}
								</p>
							) : null}
							<ConflictForm
								conflict={conflict}
								documents={documents}
								session={session}
							/>
						</li>
					))}
				</ul>

				{resolutions.length > 0 ? (
					<div className="openitr-resolutions">
						<h3 className="openitr-resolutions-heading">
							Recorded resolutions ({resolutions.length})
						</h3>
						<dl className="openitr-result-details openitr-resolution-list">
							{resolutions.map((resolution) => (
								<div
									data-resolution-id={resolution.resolutionId}
									key={resolution.resolutionId}
								>
									<dt>
										<code>{String(resolution.factKey)}</code>
									</dt>
									<dd>
										<strong>
											{resolution.choice.kind === "attested"
												? `${rupeeText(resolution.choice.value)} (attested by you)`
												: `${rupeeText(resolution.choice.value)} (source observation)`}
										</strong>
										<small className="openitr-summary-hint">
											{" "}
											— {resolution.reason} · recorded {resolution.recordedAt}
											. Original evidence retained.
										</small>
									</dd>
								</div>
							))}
						</dl>
					</div>
				) : null}
			</CardBody>
		</Card>
	);
};

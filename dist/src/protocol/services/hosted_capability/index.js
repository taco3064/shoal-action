import { allowedSummaryWorkflows } from '../network_compatibility';
export const hostedWorkflowPath = '.github/workflows/hosted-review.yml';
// Exact verified Action commit and Station workflow bytes. This binding never
// follows main or a release tag. Production broker and Reviewer authorization
// remain separate evidence gates.
export const hostedCapabilities = [{
        callerDigest: 'b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
        auxiliaryDigest: 'c75a1f6a57b319d849f23ddd26753fc49ba0cf7fff1a90ddcfc63b1b43300e88',
        actionCommit: 'e6686785c66d80bdf0494cee57828814703c2d65',
        actionPath: 'hosted-review/',
        runtimeSourceCommit: '230a97af21c45b8d8f0cdcd4a02d13dddd2c4730',
        runtimeSourceTree: 'db8cfb7ed4cb54c4bc60569b5e55ed36fa68452c',
        brokerFormatVersion: 1,
    }];
export function resolveHostedCapability(callerDigest, auxiliaryDigest) {
    if (!callerDigest || !allowedSummaryWorkflows.has(callerDigest)) {
        return null;
    }
    return hostedCapabilities.find((binding) => binding.callerDigest === callerDigest
        && binding.auxiliaryDigest === auxiliaryDigest) ?? null;
}

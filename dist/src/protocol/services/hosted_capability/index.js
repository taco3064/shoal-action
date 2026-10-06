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
    }, {
        callerDigest: '0dee3b797307225e38b475e0456cff6434ca53c4b0580fb3f4a11dfdc5eece35',
        auxiliaryDigest: 'd249b9784349b631e6a42b252870eabdfc6aab359e22899dbc18f89431e7ac9b',
        actionCommit: 'ee10f943abab1438e553d00591e625a78b931846',
        actionPath: 'hosted-review/',
        runtimeSourceCommit: '980d9eaecb820c32d3693aea487a3b3029ed254e',
        runtimeSourceTree: '540b914ed13ce97841ae0685fd36c7e1179bcaa5',
        brokerFormatVersion: 1,
    }];
export function resolveHostedCapability(callerDigest, auxiliaryDigest) {
    if (!callerDigest || !allowedSummaryWorkflows.has(callerDigest)) {
        return null;
    }
    return hostedCapabilities.find((binding) => binding.callerDigest === callerDigest
        && binding.auxiliaryDigest === auxiliaryDigest) ?? null;
}

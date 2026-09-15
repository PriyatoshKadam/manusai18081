'use client';

import VendorView from './vendor-view-pdf';
import ReferenceMonitoringPanels from './reference-monitoring-panels';
import EventIssueTimestampEnhancer from './event-issue-timestamp-enhancer';
import ParameterGovernanceTableEnhancer from './parameter-governance-table-enhancer';
import PageGovernanceTableEnhancer from './page-governance-table-enhancer';
import ConsentGovernanceEnhancer from './consent-governance-enhancer';

export default function VendorViewWithReferenceMonitoring(props: { vendor: string; label: string; id: string | null }) {
  return <><VendorView {...props} /><ReferenceMonitoringPanels vendor={props.vendor} /><EventIssueTimestampEnhancer vendor={props.vendor} /><ParameterGovernanceTableEnhancer vendor={props.vendor} /><PageGovernanceTableEnhancer vendor={props.vendor} /><ConsentGovernanceEnhancer vendor={props.vendor} /></>;
}

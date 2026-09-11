'use client';

import VendorView from './vendor-view-pdf';
import ReferenceMonitoringPanels from './reference-monitoring-panels';
import EventIssueTimestampEnhancer from './event-issue-timestamp-enhancer';

export default function VendorViewWithReferenceMonitoring(props: { vendor: string; label: string; id: string | null }) {
  return <><VendorView {...props} /><ReferenceMonitoringPanels vendor={props.vendor} /><EventIssueTimestampEnhancer vendor={props.vendor} /></>;
}

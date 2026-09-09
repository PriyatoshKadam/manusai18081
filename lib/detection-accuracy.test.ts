import { describe, expect, it } from 'vitest';
import { classifyDuplicateProof, shouldKeepDuplicateAlert } from './detection-accuracy';

describe('detection accuracy gate', () => {
  it('requires stable transaction identity for duplicate purchases', () => {
    expect(classifyDuplicateProof({ eventName: 'purchase', currentParams: { transaction_id: 'T-100' }, previousParams: { transaction_id: 'T-100' } })).toBe('same_transaction_id');
    expect(shouldKeepDuplicateAlert({ code: 'duplicate_purchase', eventName: 'purchase', currentParams: { transaction_id: 'T-100' }, previousParams: { transaction_id: 'T-100' } })).toBe(true);
  });

  it('rejects a purchase duplicate when transaction IDs differ', () => {
    expect(classifyDuplicateProof({ eventName: 'purchase', currentParams: { transaction_id: 'T-101' }, previousParams: { transaction_id: 'T-100' } })).toBe('different_transaction_ids');
    expect(shouldKeepDuplicateAlert({ code: 'duplicate_purchase', eventName: 'purchase', currentParams: { transaction_id: 'T-101' }, previousParams: { transaction_id: 'T-100' } })).toBe(false);
  });

  it('does not treat matching purchase payloads as duplicate without strong evidence', () => {
    expect(classifyDuplicateProof({ eventName: 'purchase', currentParams: { value: 100, currency: 'USD' }, previousParams: { value: 100, currency: 'USD' }, sameRequestSignature: true, deliveredNetworkCount: 1 })).toBe('insufficient_evidence');
    expect(shouldKeepDuplicateAlert({ code: 'duplicate_purchase', eventName: 'purchase', currentParams: { value: 100 }, previousParams: { value: 100 }, sameRequestSignature: true, deliveredNetworkCount: 1 })).toBe(false);
  });

  it('accepts one occurrence producing multiple successful network deliveries', () => {
    expect(classifyDuplicateProof({ eventName: 'login', sameOccurrence: true, deliveredNetworkCount: 2 })).toBe('same_occurrence_multiple_deliveries');
    expect(shouldKeepDuplicateAlert({ code: 'duplicate_event', eventName: 'login', sameOccurrence: true, deliveredNetworkCount: 2 })).toBe(true);
  });

  it('accepts matching explicit event_id for high-value events', () => {
    expect(classifyDuplicateProof({ eventName: 'generate_lead', currentParams: { event_id: 'evt-1' }, previousParams: { event_id: 'evt-1' } })).toBe('same_event_id');
    expect(shouldKeepDuplicateAlert({ code: 'duplicate_event', eventName: 'generate_lead', currentParams: { event_id: 'evt-1' }, previousParams: { event_id: 'evt-1' } })).toBe(true);
  });

  it('rejects high-value duplicate claims when explicit event IDs differ', () => {
    expect(shouldKeepDuplicateAlert({ code: 'duplicate_event', eventName: 'login', currentParams: { event_id: 'evt-2' }, previousParams: { event_id: 'evt-1' }, sameRequestSignature: true, deliveredNetworkCount: 2 })).toBe(false);
  });

  it('keeps lower-risk duplicate evidence only when there are two comparable deliveries', () => {
    expect(shouldKeepDuplicateAlert({ code: 'duplicate_event', eventName: 'custom_event', sameRequestSignature: true, deliveredNetworkCount: 2 })).toBe(true);
    expect(shouldKeepDuplicateAlert({ code: 'duplicate_event', eventName: 'custom_event', sameRequestSignature: true, deliveredNetworkCount: 1 })).toBe(false);
  });
});

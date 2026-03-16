'use client';

import { useState, useCallback } from 'react';

export interface JoinNodeData {
  name: string;
  role: 'touchdesigner' | 'browser' | 'max_msp' | 'arduino' | 'scope';
  intent: string;
  claimCode: string;
}

interface JoinModalProps {
  open: boolean;
  onClose: () => void;
  onJoin: (data: JoinNodeData) => void;
}

function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 2) code += '-';
  }
  return code;
}

const ROLES = [
  { value: 'touchdesigner', label: 'TouchDesigner' },
  { value: 'browser', label: 'Browser / Web' },
  { value: 'max_msp', label: 'Max/MSP' },
  { value: 'arduino', label: 'Arduino / Hardware' },
  { value: 'scope', label: 'Scope / Monitoring' },
];

const INTENTS = [
  'Visual output (streaming)',
  'Audio reactive input',
  'Control surface',
  'Data source',
  'Monitoring only',
  'Custom',
];

export default function JoinModal({ open, onClose, onJoin }: JoinModalProps) {
  const [step, setStep] = useState(0); // 0=name, 1=role+intent, 2=connect card
  const [name, setName] = useState('');
  const [role, setRole] = useState<JoinNodeData['role']>('touchdesigner');
  const [intent, setIntent] = useState('Visual output (streaming)');
  const [claimCode] = useState(generateClaimCode);

  const handleNext = useCallback(() => {
    if (step === 0 && name.trim()) setStep(1);
    else if (step === 1) setStep(2);
  }, [step, name]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  const handleJoin = useCallback(() => {
    onJoin({ name: name.trim(), role, intent, claimCode });
    // Reset
    setStep(0);
    setName('');
    setRole('touchdesigner');
    setIntent('Visual output (streaming)');
  }, [name, role, intent, claimCode, onJoin]);

  const handleClose = useCallback(() => {
    onClose();
    setStep(0);
    setName('');
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Join Node</div>
        <div className="modal-subtitle">
          {step === 0 && 'Name your node to identify it in the fleet.'}
          {step === 1 && 'Select your node type and what it will do.'}
          {step === 2 && 'Your node is ready to connect. Use the claim code in TouchDesigner.'}
        </div>

        {/* Step indicators */}
        <div className="modal-steps">
          <div className={`modal-step ${step > 0 ? 'done' : step === 0 ? 'current' : ''}`} />
          <div className={`modal-step ${step > 1 ? 'done' : step === 1 ? 'current' : ''}`} />
          <div className={`modal-step ${step > 2 ? 'done' : step === 2 ? 'current' : ''}`} />
        </div>

        {/* Step 0: Name */}
        {step === 0 && (
          <div className="modal-field">
            <label>Node Name</label>
            <input
              type="text"
              placeholder="e.g. krista-td, visuals-1, audio-in..."
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNext()}
              autoFocus
            />
          </div>
        )}

        {/* Step 1: Role + Intent */}
        {step === 1 && (
          <>
            <div className="modal-field">
              <label>Node Role</label>
              <select value={role} onChange={e => setRole(e.target.value as JoinNodeData['role'])}>
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label>Intent</label>
              <select value={intent} onChange={e => setIntent(e.target.value)}>
                {INTENTS.map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Step 2: Connect Card */}
        {step === 2 && (
          <div className="connect-card">
            <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '4px' }}>
              Claim Code
            </div>
            <div className="claim-code">{claimCode}</div>
            <div className="claim-hint">
              Enter this code in your TOX&apos;s Claim Code parameter, or the node will auto-register as <strong style={{ color: 'var(--accent)' }}>{name}</strong>
            </div>
            <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--active)' }}>{name}</strong> &middot; {ROLES.find(r => r.value === role)?.label} &middot; {intent}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          {step > 0 && (
            <button className="btn" onClick={handleBack}>Back</button>
          )}
          {step < 2 ? (
            <button
              className="btn primary"
              onClick={handleNext}
              disabled={step === 0 && !name.trim()}
              style={{ opacity: step === 0 && !name.trim() ? 0.4 : 1 }}
            >
              Next
            </button>
          ) : (
            <button className="btn primary" onClick={handleJoin} style={{ background: 'rgba(0,255,136,0.08)', borderColor: 'var(--active)', color: 'var(--active)' }}>
              Connect Node
            </button>
          )}
          <button className="btn" onClick={handleClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

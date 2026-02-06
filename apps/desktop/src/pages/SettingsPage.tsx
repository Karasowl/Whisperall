import { useSettingsStore } from '../stores/settings';
import { useAuthStore } from '../stores/auth';
import { UsageMeter } from '../components/UsageMeter';
import { useState } from 'react';

export function SettingsPage() {
  const settings = useSettingsStore();
  const { user, signIn, signUp, signInWithGoogle, signOut, loading, error } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="page">
      <h2>Settings</h2>

      {/* Auth Section */}
      <section className="settings-section">
        <h3>Account</h3>
        {user ? (
          <div className="settings-row">
            <span>Signed in as {user.email}</span>
            <button className="btn-ghost" onClick={signOut}>Sign Out</button>
          </div>
        ) : (
          <div className="auth-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="auth-actions">
              <button className="btn-primary" onClick={() => signIn(email, password)} disabled={loading}>
                Sign In
              </button>
              <button className="btn-ghost" onClick={() => signUp(email, password)} disabled={loading}>
                Sign Up
              </button>
            </div>
            <div className="auth-divider"><span>or</span></div>
            <button className="btn-google" onClick={signInWithGoogle} disabled={loading}>
              <span className="material-symbols-outlined">public</span>
              Continue with Google
            </button>
            {error && <p className="error-text">{error}</p>}
          </div>
        )}
      </section>

      {/* Usage */}
      {user && (
        <section className="settings-section">
          <h3>Usage</h3>
          <UsageMeter />
        </section>
      )}

      {/* Language */}
      <section className="settings-section">
        <h3>Language</h3>
        <select value={settings.language} onChange={(e) => settings.setLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="pt">Portuguese</option>
          <option value="ja">Japanese</option>
          <option value="zh">Chinese</option>
        </select>
      </section>

      {/* Dictation */}
      <section className="settings-section">
        <h3>Dictation</h3>
        <div className="settings-row">
          <label>Hotkey mode</label>
          <select
            value={settings.hotkeyMode}
            onChange={(e) => settings.setHotkeyMode(e.target.value as 'toggle' | 'hold')}
          >
            <option value="toggle">Toggle (press to start/stop)</option>
            <option value="hold">Hold (hold to record)</option>
          </select>
        </div>
        <div className="settings-row">
          <label>Show overlay widget</label>
          <input
            type="checkbox"
            checked={settings.overlayEnabled}
            onChange={(e) => settings.setOverlayEnabled(e.target.checked)}
          />
        </div>
      </section>

      {/* Hotkeys */}
      <section className="settings-section">
        <h3>Hotkeys</h3>
        {Object.entries(settings.hotkeys).map(([action, accelerator]) => (
          <div key={action} className="settings-row">
            <label>{action.replace(/_/g, ' ')}</label>
            <input
              type="text"
              value={accelerator}
              onChange={(e) => settings.setHotkey(action, e.target.value)}
            />
          </div>
        ))}
      </section>

      {/* System */}
      <section className="settings-section">
        <h3>System</h3>
        <div className="settings-row">
          <label>Minimize to tray</label>
          <input
            type="checkbox"
            checked={settings.minimizeToTray}
            onChange={(e) => settings.setMinimizeToTray(e.target.checked)}
          />
        </div>
        <div className="settings-row">
          <label>Show notifications</label>
          <input
            type="checkbox"
            checked={settings.showNotifications}
            onChange={(e) => settings.setShowNotifications(e.target.checked)}
          />
        </div>
      </section>
    </div>
  );
}

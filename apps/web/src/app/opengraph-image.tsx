import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'WhisperAll — Your voice, supercharged';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #101922 0%, #1c242c 100%)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '12px',
            marginBottom: '32px',
          }}
        >
          <div style={{ width: 20, height: 80, background: '#137fec', borderRadius: 10 }} />
          <div style={{ width: 20, height: 130, background: '#137fec', borderRadius: 10 }} />
          <div style={{ width: 20, height: 56, background: '#137fec', borderRadius: 10 }} />
        </div>
        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-2px',
          }}
        >
          WhisperAll
        </div>
        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: '#9dabb9',
            marginTop: '16px',
          }}
        >
          Your voice, supercharged
        </div>
        {/* Features */}
        <div
          style={{
            display: 'flex',
            gap: '24px',
            marginTop: '40px',
            fontSize: 18,
            color: '#137fec',
          }}
        >
          <span>Dictate</span>
          <span style={{ color: '#283039' }}>·</span>
          <span>Transcribe</span>
          <span style={{ color: '#283039' }}>·</span>
          <span>Translate</span>
          <span style={{ color: '#283039' }}>·</span>
          <span>Caption</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

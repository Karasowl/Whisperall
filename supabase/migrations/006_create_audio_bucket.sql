-- Create the 'audio' storage bucket used by transcription, TTS, and edge-tts
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to the audio bucket
CREATE POLICY "audio_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'audio');

-- Allow authenticated users to read their own uploads
CREATE POLICY "audio_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'audio');

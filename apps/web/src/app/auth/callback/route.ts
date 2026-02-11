import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get('next') ?? '/dashboard';

  // Handle OAuth/provider errors forwarded by Supabase
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  if (error || errorDescription) {
    const msg = encodeURIComponent(errorDescription || error || 'auth');
    return NextResponse.redirect(`${origin}/?error=${msg}`);
  }

  const code = searchParams.get('code');
  if (code) {
    const supabase = await createServerSupabase();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/?error=session_exchange_failed`);
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}

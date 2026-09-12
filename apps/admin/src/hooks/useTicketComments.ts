import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ticketCommentsKey } from '@/lib/queryKeys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketComment {
  id: string;
  ticket_id: string;
  body: string;
  created_at: string;
  author_staff_id: string | null;
  author_full_name: string | null;
}

// ---------------------------------------------------------------------------
// Fetcher — cross-schema embed with staff-name fallback
//
// Mirrors the installer's useTicketComments. First attempts the cross-schema
// embed `author:author_staff_id(id, full_name)` from support.ticket_comments
// → identity.staff. When PostgREST cannot resolve the cross-schema FK, falls
// back to a flat fetch plus a batch lookup of identity.staff rows keyed by
// the distinct author_staff_id values in the payload.
// ---------------------------------------------------------------------------

interface RawCommentWithAuthor {
  id: string;
  ticket_id: string;
  body: string;
  created_at: string;
  author_staff_id: string | null;
  author: { id: string; full_name: string } | null;
}

interface RawCommentFlat {
  id: string;
  ticket_id: string;
  body: string;
  created_at: string;
  author_staff_id: string | null;
}

const PGRST_EMBED_ERRORS = new Set(['PGRST100', 'PGRST200', 'PGRST201']);

async function fetchTicketComments(ticketId: string): Promise<TicketComment[]> {
  // Attempt 1: cross-schema embed
  const { data: embedData, error: embedError } = await supabase
    .schema('support')
    .from('ticket_comments')
    .select(
      `
      id,
      ticket_id,
      body,
      created_at,
      author_staff_id,
      author:author_staff_id(id, full_name)
    `,
    )
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (!embedError && embedData) {
    return (embedData as unknown as RawCommentWithAuthor[]).map((c) => ({
      id: c.id,
      ticket_id: c.ticket_id,
      body: c.body,
      created_at: c.created_at,
      author_staff_id: c.author_staff_id,
      author_full_name: c.author?.full_name ?? null,
    }));
  }

  // Non-embed errors propagate untouched.
  if (embedError && !PGRST_EMBED_ERRORS.has(embedError.code)) {
    throw embedError;
  }

  // Fallback: flat fetch + batch staff lookup
  const { data: flatData, error: flatError } = await supabase
    .schema('support')
    .from('ticket_comments')
    .select('id, ticket_id, body, created_at, author_staff_id')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (flatError) throw flatError;

  const comments = (flatData ?? []) as RawCommentFlat[];
  const staffIds = [
    ...new Set(comments.map((c) => c.author_staff_id).filter((id): id is string => id !== null)),
  ];

  let staffNameMap = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffData } = await supabase
      .schema('identity')
      .from('staff')
      .select('id, full_name')
      .in('id', staffIds);

    if (staffData) {
      staffNameMap = new Map(
        (staffData as { id: string; full_name: string }[]).map((s) => [s.id, s.full_name]),
      );
    }
  }

  return comments.map((c) => ({
    id: c.id,
    ticket_id: c.ticket_id,
    body: c.body,
    created_at: c.created_at,
    author_staff_id: c.author_staff_id,
    // Fall back to a truncated staff id when the name is not readable.
    author_full_name: c.author_staff_id
      ? (staffNameMap.get(c.author_staff_id) ?? c.author_staff_id.slice(0, 8))
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTicketComments(ticketId: string | undefined): UseQueryResult<TicketComment[]> {
  const id = ticketId ?? '';
  return useQuery({
    queryKey: ticketCommentsKey(id),
    queryFn: () => fetchTicketComments(id),
    enabled: Boolean(id),
  });
}

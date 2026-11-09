'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addComment, deleteChart, deleteComment, setLike, updateDescription } from '@/lib/charts';
import { errorStatus } from '@/lib/http';
import { requireViewer } from '@/lib/session';

export interface ActionState {
  error?: string;
  ok?: boolean;
}

async function run(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { error: errorStatus(err).message };
  }
}

function chartId(form: FormData) {
  const id = Number(form.get('chartId'));
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('bad chart id');
  return id;
}

export async function toggleLikeAction(chartIdValue: number, liked: boolean): Promise<ActionState & { count?: number }> {
  try {
    const viewer = await requireViewer();
    const count = await setLike(viewer, chartIdValue, liked);
    revalidatePath(`/charts/${chartIdValue}`);
    return { ok: true, count };
  } catch (err) {
    return { error: errorStatus(err).message };
  }
}

export async function postCommentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const viewer = await requireViewer();
    const id = chartId(form);
    await addComment(viewer, id, String(form.get('body') ?? ''));
    revalidatePath(`/charts/${id}`);
  });
}

export async function deleteCommentAction(commentId: number): Promise<ActionState> {
  return run(async () => {
    const viewer = await requireViewer();
    const id = await deleteComment(viewer, commentId);
    revalidatePath(`/charts/${id}`);
  });
}

export async function saveDescriptionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const viewer = await requireViewer();
    const id = chartId(form);
    await updateDescription(viewer, id, String(form.get('description') ?? ''));
    revalidatePath(`/charts/${id}`);
  });
}

export async function deleteChartAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let uploader = '';
  const result = await run(async () => {
    const viewer = await requireViewer();
    await deleteChart(viewer, chartId(form));
    uploader = viewer.id;
  });
  if (result.ok) {
    revalidatePath('/');
    redirect(`/users/${uploader}`);
  }
  return result;
}

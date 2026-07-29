import type { CoverLetter, CoverLetterVersion } from "@/types";
import { CoverLetterRepository } from "@/repositories/CoverLetterRepository";
import { DocumentStorage } from "@/services/storage/DocumentStorage";
import {
  COVER_LETTER_STATUSES,
  DEFAULT_LENGTH,
  DEFAULT_TONE,
  MAX_LETTER_CHARS,
  MAX_LETTER_NAME,
  VERSION_SOURCES,
  type CoverLetterAIAction,
  type CoverLetterLength,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";
import { countWords } from "@/features/cover-letters/stats";

const coverLetterRepo = new CoverLetterRepository();
const documentStorage = new DocumentStorage();

/**
 * CoverLetterService
 *
 * Module 3B created cover letters as an upload-only entity backed by the private
 * `documents` bucket. Module 6E turns the same entity into the Cover Letter
 * Studio document: `content` is the editor's working buffer and every generation,
 * AI edit, manual save, duplicate and restore APPENDS a row to
 * `cover_letter_versions`. Nothing is ever overwritten in history.
 *
 * All of this runs client-side under RLS (like resume CRUD) — only the
 * credit-consuming AI calls go through a server function.
 */
export class CoverLetterService {
  async getCoverLetters(userId: string): Promise<CoverLetter[]> {
    return coverLetterRepo.findAllByUser(userId);
  }

  async getCoverLetter(id: string): Promise<CoverLetter | null> {
    return coverLetterRepo.findById(id);
  }

  async getCoverLettersForJob(userId: string, jobId: string): Promise<CoverLetter[]> {
    return coverLetterRepo.findByJob(userId, jobId);
  }

  async uploadCoverLetter(
    userId: string,
    name: string,
    file: File,
    versionNumber = 1,
  ): Promise<CoverLetter> {
    const coverLetter = await coverLetterRepo.create(userId, {
      name,
      version_number: versionNumber,
    });
    const path = await documentStorage.upload(userId, coverLetter.id, file);
    return coverLetterRepo.updateFileUrl(coverLetter.id, path);
  }

  async deleteCoverLetter(id: string): Promise<void> {
    return coverLetterRepo.delete(id);
  }

  /** Signed download URL for a cover letter file — the documents bucket is private. */
  async getDownloadUrl(path: string): Promise<string> {
    return documentStorage.getSignedUrl(path);
  }

  // ── Cover Letter Studio (Module 6E) ──────────────────────────────────────

  /**
   * Creates a Studio document from a first generation and records it as
   * Version 1. The document and its version are always created together — a
   * Studio letter with no version would have no history to switch back to.
   *
   * `sessionId` opens the document's editing session (see CoverLetterAIService)
   * so every refinement action on this letter is free until the user
   * explicitly regenerates the entire thing.
   */
  async createFromGeneration(
    userId: string,
    input: {
      name: string;
      content: string;
      jobId: string | null;
      resumeId: string | null;
      companyName: string | null;
      roleTitle: string | null;
      tone: CoverLetterTone;
      length: CoverLetterLength;
      customInstructions?: string;
      analysisId?: string | null;
      model?: string | null;
      promptVersion?: string | null;
      analysisVersion?: string | null;
      /** How Version 1 was produced — 'generate' for AI output, 'duplicate' for a copy. */
      versionSource?: string;
      sessionId: string;
    },
  ): Promise<{ coverLetter: CoverLetter; version: CoverLetterVersion }> {
    const content = input.content.slice(0, MAX_LETTER_CHARS);
    const wordCount = countWords(content);

    const coverLetter = await coverLetterRepo.createStudioDocument(userId, {
      name: input.name.slice(0, MAX_LETTER_NAME),
      content,
      job_id: input.jobId,
      resume_id: input.resumeId,
      company_name: input.companyName,
      role_title: input.roleTitle,
      tone: input.tone,
      length: input.length,
      custom_instructions: input.customInstructions ?? null,
      word_count: wordCount,
      ai_session_id: input.sessionId,
    });

    const version = await coverLetterRepo.createVersion(coverLetter.id, userId, {
      content,
      source: input.versionSource ?? VERSION_SOURCES.GENERATE,
      tone: input.tone,
      length: input.length,
      custom_instructions: input.customInstructions ?? null,
      analysis_id: input.analysisId ?? null,
      model: input.model ?? null,
      prompt_version: input.promptVersion ?? null,
      analysis_version: input.analysisVersion ?? null,
      word_count: wordCount,
    });

    const synced = await coverLetterRepo.update(coverLetter.id, {
      current_version_id: version.id,
    });

    return { coverLetter: synced, version };
  }

  async getVersions(coverLetterId: string): Promise<CoverLetterVersion[]> {
    return coverLetterRepo.findVersions(coverLetterId);
  }

  /**
   * Appends a version and points the document at it. This is the single write
   * path used by every producer of new content — AI generations, AI actions,
   * manual saves, duplicates and restores — so `current_version_id`,
   * `word_count` and `last_edited_at` can never drift from the stored text.
   */
  async saveVersion(
    userId: string,
    coverLetterId: string,
    input: {
      content: string;
      source: string;
      label?: string | null;
      aiAction?: CoverLetterAIAction | null;
      tone?: CoverLetterTone | null;
      length?: CoverLetterLength | null;
      customInstructions?: string | null;
      analysisId?: string | null;
      model?: string | null;
      promptVersion?: string | null;
      analysisVersion?: string | null;
    },
  ): Promise<{ coverLetter: CoverLetter; version: CoverLetterVersion }> {
    const content = input.content.slice(0, MAX_LETTER_CHARS);
    const wordCount = countWords(content);

    const version = await coverLetterRepo.createVersion(coverLetterId, userId, {
      content,
      label: input.label ?? null,
      source: input.source,
      ai_action: input.aiAction ?? null,
      tone: input.tone ?? null,
      length: input.length ?? null,
      custom_instructions: input.customInstructions ?? null,
      analysis_id: input.analysisId ?? null,
      model: input.model ?? null,
      prompt_version: input.promptVersion ?? null,
      analysis_version: input.analysisVersion ?? null,
      word_count: wordCount,
    });

    const patch: Parameters<CoverLetterRepository["update"]>[1] = {
      content,
      word_count: wordCount,
      current_version_id: version.id,
      last_edited_at: new Date().toISOString(),
    };
    // A generation or AI action can change the letter's effective tone/length
    // (Change Tone / Change Length) — keep the document's settings truthful.
    if (input.tone) patch.tone = input.tone;
    if (input.length) patch.length = input.length;
    // Custom instructions the user actually generated with are part of the
    // letter's settings, not a throwaway input. Persisting them here means an
    // instruction typed in the sidebar and used for an AI action survives a
    // reload without the user having to also press "Save settings" — the
    // instruction and the letter it produced stay together.
    if (input.customInstructions !== undefined) {
      patch.custom_instructions = input.customInstructions;
    }

    const coverLetter = await coverLetterRepo.update(coverLetterId, patch);
    return { coverLetter, version };
  }

  /**
   * Switch which existing version the document is currently on. This is a
   * POINTER MOVE, not a new version — no history is written, because nothing
   * new was authored. The buffer is copied onto the document so reopening the
   * Studio later shows the version the user left it on.
   */
  async setCurrentVersion(
    coverLetterId: string,
    version: CoverLetterVersion,
  ): Promise<CoverLetter> {
    return coverLetterRepo.update(coverLetterId, {
      content: version.content,
      word_count: version.word_count ?? countWords(version.content),
      current_version_id: version.id,
    });
  }

  /** Rename the document (not a version). */
  async rename(id: string, name: string): Promise<CoverLetter> {
    return coverLetterRepo.update(id, { name: name.trim().slice(0, MAX_LETTER_NAME) });
  }

  /** Label a version ("Shorter intro"). The only permitted mutation on history. */
  async renameVersion(versionId: string, label: string | null): Promise<CoverLetterVersion> {
    const trimmed = label?.trim();
    return coverLetterRepo.renameVersion(versionId, trimmed ? trimmed : null);
  }

  async setStatus(id: string, status: string): Promise<CoverLetter> {
    const patch: Parameters<CoverLetterRepository["update"]>[1] = { status };
    if (status === COVER_LETTER_STATUSES.DOWNLOADED) {
      patch.downloaded_at = new Date().toISOString();
    }
    return coverLetterRepo.update(id, patch);
  }

  /** Persist the generation settings without touching the letter text. */
  async updateSettings(
    id: string,
    settings: {
      tone?: CoverLetterTone;
      length?: CoverLetterLength;
      customInstructions?: string | null;
    },
  ): Promise<CoverLetter> {
    const patch: Parameters<CoverLetterRepository["update"]>[1] = {};
    if (settings.tone) patch.tone = settings.tone;
    if (settings.length) patch.length = settings.length;
    if (settings.customInstructions !== undefined) {
      patch.custom_instructions = settings.customInstructions;
    }
    return coverLetterRepo.update(id, patch);
  }

  /**
   * Duplicate a whole document. The copy starts fresh at Version 1 with the
   * source letter's current text — history is a property of a document, so it
   * is deliberately not carried over.
   *
   * The copy gets its own fresh session, inheriting the source's already-paid
   * editing session rather than requiring a new credit: a duplicate is a way
   * to explore a variant of a letter that was already generated, not a way to
   * get a second free generation. No AI call happens here, so no charge applies.
   */
  async duplicateDocument(userId: string, source: CoverLetter, name: string): Promise<CoverLetter> {
    const { coverLetter } = await this.createFromGeneration(userId, {
      name,
      content: source.content ?? "",
      jobId: source.job_id ?? null,
      resumeId: source.resume_id ?? null,
      companyName: source.company_name ?? null,
      roleTitle: source.role_title ?? null,
      tone: (source.tone ?? DEFAULT_TONE) as CoverLetterTone,
      length: (source.length ?? DEFAULT_LENGTH) as CoverLetterLength,
      customInstructions: source.custom_instructions ?? undefined,
      versionSource: VERSION_SOURCES.DUPLICATE,
      sessionId: crypto.randomUUID(),
    });
    return coverLetter;
  }
}

export const coverLetterService = new CoverLetterService();

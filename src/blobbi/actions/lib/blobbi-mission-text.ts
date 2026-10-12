// src/blobbi/actions/lib/blobbi-mission-text.ts

/**
 * Localized display text for Blobbi missions.
 *
 * Mission and task definitions (and their English copy) live in
 * `@blobbi-kit/react`. Their ids are stable, so Ditto maps each id to a
 * translated descriptor at display time and falls back to the package's
 * English text for ids it doesn't know about.
 */

import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';

interface MissionText {
  title: MessageDescriptor;
  description: MessageDescriptor;
}

/** Daily bounty text, keyed by daily mission id. */
const DAILY_MISSION_TEXT: Record<string, MissionText> = {
  interact_3: defineMessages({
    title: { id: 'blobbiMissions.daily.interact3.title', defaultMessage: 'Quick Care' },
    description: { id: 'blobbiMissions.daily.interact3.description', defaultMessage: 'Interact with your Blobbi 3 times' },
  }),
  interact_6: defineMessages({
    title: { id: 'blobbiMissions.daily.interact6.title', defaultMessage: 'Attentive Caretaker' },
    description: { id: 'blobbiMissions.daily.interact6.description', defaultMessage: 'Interact with your Blobbi 6 times' },
  }),
  feed_1: defineMessages({
    title: { id: 'blobbiMissions.daily.feed1.title', defaultMessage: 'Snack Time' },
    description: { id: 'blobbiMissions.daily.feed1.description', defaultMessage: 'Feed your Blobbi once' },
  }),
  feed_2: defineMessages({
    title: { id: 'blobbiMissions.daily.feed2.title', defaultMessage: 'Hungry Blobbi' },
    description: { id: 'blobbiMissions.daily.feed2.description', defaultMessage: 'Feed your Blobbi 2 times' },
  }),
  feed_3: defineMessages({
    title: { id: 'blobbiMissions.daily.feed3.title', defaultMessage: 'Feast Day' },
    description: { id: 'blobbiMissions.daily.feed3.description', defaultMessage: 'Feed your Blobbi 3 times' },
  }),
  sleep_1: defineMessages({
    title: { id: 'blobbiMissions.daily.sleep1.title', defaultMessage: 'Nap Time' },
    description: { id: 'blobbiMissions.daily.sleep1.description', defaultMessage: 'Put your Blobbi to sleep' },
  }),
  take_photo_1: defineMessages({
    title: { id: 'blobbiMissions.daily.takePhoto1.title', defaultMessage: 'Snapshot' },
    description: { id: 'blobbiMissions.daily.takePhoto1.description', defaultMessage: 'Take a photo of your Blobbi' },
  }),
  take_photo_2: defineMessages({
    title: { id: 'blobbiMissions.daily.takePhoto2.title', defaultMessage: 'Photo Album' },
    description: { id: 'blobbiMissions.daily.takePhoto2.description', defaultMessage: 'Take 2 photos of your Blobbi' },
  }),
  clean_1: defineMessages({
    title: { id: 'blobbiMissions.daily.clean1.title', defaultMessage: 'Quick Cleanup' },
    description: { id: 'blobbiMissions.daily.clean1.description', defaultMessage: 'Clean your Blobbi once' },
  }),
  clean_2: defineMessages({
    title: { id: 'blobbiMissions.daily.clean2.title', defaultMessage: 'Squeaky Clean' },
    description: { id: 'blobbiMissions.daily.clean2.description', defaultMessage: 'Clean your Blobbi 2 times' },
  }),
  sing_1: defineMessages({
    title: { id: 'blobbiMissions.daily.sing1.title', defaultMessage: 'Sing Along' },
    description: { id: 'blobbiMissions.daily.sing1.description', defaultMessage: 'Sing a song to your Blobbi' },
  }),
  sing_2: defineMessages({
    title: { id: 'blobbiMissions.daily.sing2.title', defaultMessage: 'Karaoke Session' },
    description: { id: 'blobbiMissions.daily.sing2.description', defaultMessage: 'Sing 2 songs to your Blobbi' },
  }),
  play_music_1: defineMessages({
    title: { id: 'blobbiMissions.daily.playMusic1.title', defaultMessage: 'DJ Time' },
    description: { id: 'blobbiMissions.daily.playMusic1.description', defaultMessage: 'Play a song for your Blobbi' },
  }),
  play_music_2: defineMessages({
    title: { id: 'blobbiMissions.daily.playMusic2.title', defaultMessage: 'Music Marathon' },
    description: { id: 'blobbiMissions.daily.playMusic2.description', defaultMessage: 'Play 2 songs for your Blobbi' },
  }),
  medicine_1: defineMessages({
    title: { id: 'blobbiMissions.daily.medicine1.title', defaultMessage: 'Health Check' },
    description: { id: 'blobbiMissions.daily.medicine1.description', defaultMessage: 'Give medicine to your Blobbi' },
  }),
  medicine_2: defineMessages({
    title: { id: 'blobbiMissions.daily.medicine2.title', defaultMessage: 'Doctor Visit' },
    description: { id: 'blobbiMissions.daily.medicine2.description', defaultMessage: 'Give medicine to your Blobbi 2 times' },
  }),
};

/**
 * Hatch / evolve task text, keyed by task id. Descriptions receive the task's
 * `required` count as `{count}`.
 */
const TASK_TEXT: Record<string, MissionText> = {
  create_theme: defineMessages({
    title: { id: 'blobbiMissions.task.createTheme.title', defaultMessage: 'Create Theme' },
    description: { id: 'blobbiMissions.task.createTheme.description', defaultMessage: 'Create a custom theme for your profile' },
  }),
  color_moment: defineMessages({
    title: { id: 'blobbiMissions.task.colorMoment.title', defaultMessage: 'Color Moment' },
    description: { id: 'blobbiMissions.task.colorMoment.description', defaultMessage: 'Share a color moment on espy' },
  }),
  interactions: defineMessages({
    title: { id: 'blobbiMissions.task.interactions.title', defaultMessage: 'Interact with Blobbi' },
    description: { id: 'blobbiMissions.task.interactions.description', defaultMessage: 'Care for your Blobbi {count, plural, one {# time} other {# times}}' },
  }),
  create_themes: defineMessages({
    title: { id: 'blobbiMissions.task.createThemes.title', defaultMessage: 'Create Themes' },
    description: { id: 'blobbiMissions.task.createThemes.description', defaultMessage: 'Create {count} custom themes' },
  }),
  color_moments: defineMessages({
    title: { id: 'blobbiMissions.task.colorMoments.title', defaultMessage: 'Color Moments' },
    description: { id: 'blobbiMissions.task.colorMoments.description', defaultMessage: 'Share {count} color moments on espy' },
  }),
  edit_profile: defineMessages({
    title: { id: 'blobbiMissions.task.editProfile.title', defaultMessage: 'Edit Your Profile' },
    description: { id: 'blobbiMissions.task.editProfile.description', defaultMessage: 'Update your profile info or customize your profile tabs' },
  }),
  maintain_stats: defineMessages({
    title: { id: 'blobbiMissions.task.maintainStats.title', defaultMessage: 'Peak Condition' },
    description: { id: 'blobbiMissions.task.maintainStats.description', defaultMessage: 'Keep all stats above {count}' },
  }),
};

/** Localized title of a daily mission. */
export function formatDailyMissionTitle(intl: IntlShape, mission: { id: string; title?: string }): string {
  const text = DAILY_MISSION_TEXT[mission.id];
  return text ? intl.formatMessage(text.title) : (mission.title ?? mission.id);
}

/** Localized description of a daily mission. */
export function formatDailyMissionDescription(intl: IntlShape, mission: { id: string; description: string }): string {
  const text = DAILY_MISSION_TEXT[mission.id];
  return text ? intl.formatMessage(text.description) : mission.description;
}

/** Localized name of a hatch / evolve task. */
export function formatTaskName(intl: IntlShape, task: { id: string; name: string }): string {
  const text = TASK_TEXT[task.id];
  return text ? intl.formatMessage(text.title) : task.name;
}

/** Localized description of a hatch / evolve task. */
export function formatTaskDescription(intl: IntlShape, task: { id: string; description: string; required: number }): string {
  const text = TASK_TEXT[task.id];
  return text ? intl.formatMessage(text.description, { count: task.required }) : task.description;
}

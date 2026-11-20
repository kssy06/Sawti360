/**
 * Audio of the synthesized lines, by project and line: object URLs in simulated mode,
 * signed URLs (10 min) of the server in back-end mode. Read by the timeline, the result and the export.
 */
export const audioUrls = new Map<string, string>();
export const audioKey = (projectId: string, segId: string) => `${projectId}/${segId}`;

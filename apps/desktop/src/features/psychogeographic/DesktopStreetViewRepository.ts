import type {
  ImportStreetViewImageInput,
  StreetViewImageRecord,
  StreetViewRepository,
} from "@research-canvas/domain";
import type { WorkspaceServices } from "@research-canvas/desktop-api";

/** Desktop adapter for Surface #3 companion imagery and local redaction. */
export class DesktopStreetViewRepository implements StreetViewRepository {
  constructor(
    private readonly transport: WorkspaceServices,
    private readonly databasePath: string,
    private readonly mediaRoot: string,
  ) {}

  async listImages(profileScope: string): Promise<StreetViewImageRecord[]> {
    return this.transport.listStreetViewImages({
      databasePath: this.databasePath,
      profileScope,
    });
  }

  async importImage(input: ImportStreetViewImageInput): Promise<StreetViewImageRecord> {
    const staged = await this.transport.stageStreetViewImage({
      mediaRoot: this.mediaRoot,
      profileScope: input.profileScope,
      fileName: input.fileName,
      bytes: input.bytes,
    });
    const now = new Date().toISOString();
    const image: StreetViewImageRecord = {
      id: `sv-${crypto.randomUUID()}`,
      profileScope: input.profileScope,
      artifactPath: staged.artifactPath,
      capturedAt: input.capturedAt,
      latitude: input.latitude,
      longitude: input.longitude,
      headingDegrees: input.headingDegrees,
      redactionStatus: "pending",
      redactionRegions: input.redactionRegions,
      redactedArtifactPath: null,
      createdAt: now,
      updatedAt: now,
    };
    const registered = await this.transport.registerStreetViewImage({
      databasePath: this.databasePath,
      mediaRoot: this.mediaRoot,
      image,
    });
    if (input.noRedactionNeeded) {
      return this.transport.markStreetViewRedactionNoneNeeded({
        databasePath: this.databasePath,
        id: registered.id,
      });
    }
    if (registered.redactionRegions.length > 0) {
      return this.transport.applyStreetViewRedaction({
        databasePath: this.databasePath,
        mediaRoot: this.mediaRoot,
        id: registered.id,
      });
    }
    return registered;
  }
}

import { z } from 'zod';

// §4.4: MANIFEST.json usa paths relativos; nunca paths absolutos da máquina do usuário.
const relativePath = z
  .string()
  .min(1)
  .refine((p) => !/^([a-zA-Z]:[\\/]|[\\/]{1,2})/.test(p), 'path must be relative')
  .refine((p) => !p.split(/[\\/]/).includes('..'), 'path must not escape project root');

export const ManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projectId: z.string().regex(/^prj_[0-9a-z]{8,}$/),
  name: z.string().min(1),
  createdAt: z.iso.datetime(),
  versions: z.strictObject({ projectSchema: z.number().int(), dbSchema: z.number().int() }),
  sources: z.array(z.strictObject({ path: relativePath, sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
});
export type Manifest = z.infer<typeof ManifestSchema>;

---
name: file-uploads
description: Upload files (images, media, attachments) from the browser to a Blossom server via the useUploadFile hook, and attach them to Nostr events with NIP-94 imeta tags.
---

# File Uploads on Nostr

This project includes a `useUploadFile` hook that uploads files to Blossom servers and returns NIP-94-compatible tags. Use it whenever a feature needs to accept a user-provided file (avatars, banners, post attachments, etc.).

## The `useUploadFile` Hook

```tsx
import { useUploadFile } from "@/hooks/useUploadFile";

function MyComponent() {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  const handleUpload = async (file: File) => {
    try {
      // Returns an array of NIP-94-compatible tags.
      // The first tag is the `url` tag; its second element is the file URL.
      const tags = await uploadFile(file);
      const url = tags[0][1];
      // ...use the url
    } catch (error) {
      // ...handle errors (show a toast, etc.)
    }
  };

  // ...rest of component
}
```

The hook is a TanStack Query mutation, so `isPending` can drive loading UI and `mutateAsync` integrates cleanly with `async`/`await` flows.

## Attaching Files to Events

### Kind 0 (profile metadata)

Use the plain URL in the relevant JSON field:

```ts
const tags = await uploadFile(file);
const url = tags[0][1];

createEvent({
  kind: 0,
  content: JSON.stringify({ ...existingMetadata, picture: url }),
});
```

### Kind 1 (text notes) and other content events

Append the URL to `content`, and add one `imeta` tag per file. `imeta` carries the NIP-94 metadata (mime type, dimensions, blurhash, etc.) that the uploader returned:

```ts
const tags = await uploadFile(file); // e.g. [["url", "https://..."], ["m", "image/png"], ["dim", "1024x768"], ...]
const url = tags[0][1];

// Flatten the NIP-94 tags into a single imeta tag value.
const imeta = tags.map(([name, value]) => `${name} ${value}`);

createEvent({
  kind: 1,
  content: `Check this out ${url}`,
  tags: [["imeta", ...imeta]],
});
```

Repeat the pattern (one `imeta` tag per file) for multiple attachments.

## Common Patterns

- **Avatar / banner pickers:** wrap an `<input type="file" accept="image/*">` and call `uploadFile` on change; on success, update the relevant profile field and publish a kind 0 event.
- **Post composers:** call `uploadFile` for each selected file before publishing the note, then build `imeta` tags alongside `content`.
- **Progress UI:** use `isPending` from the mutation to disable the submit button and show a spinner or skeleton.
- **Error handling:** wrap `uploadFile` in `try/catch` and surface failures via `useToast` — network and Blossom-server errors are common and should never break the UI.

## Constraints

- The hook requires a logged-in user (Blossom auth is signed by the user's signer). Guard uploads behind `useCurrentUser`.
- Don't store or display raw `File` objects after upload — always use the returned URL.
- Large files may take time; prefer `mutateAsync` over `mutate` so the caller can `await` completion before publishing an event that references the URL.

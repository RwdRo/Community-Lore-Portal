import {PAGES} from '../services/pagesRuntime';
import { useState } from 'react';
import { assetImageUrl } from '../../shared/ipfs';

export function AssetImage({ reference, name, className }: {
  reference: string; name: string; className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const original = assetImageUrl(reference);
  const source = PAGES && original.startsWith('/api/assets/ipfs?ref=') ? 'https://ipfs.io/ipfs/'+decodeURIComponent(original.split('ref=')[1]) : original;
  return <img
    src={failedSource === source ? '/asset-unavailable.svg' : source}
    alt={name}
    className={className}
    loading="lazy"
    decoding="async"
    referrerPolicy="no-referrer"
    onError={failedSource === source ? undefined : () => setFailedSource(source)}
  />;
}

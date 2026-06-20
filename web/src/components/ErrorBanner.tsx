import { memo } from 'react';
import { Alert } from '@clickhouse/click-ui';

// Pure error surface, used for both transport failures and per-statement SQL errors.
export interface ErrorBannerProps {
  message: string;
  title?: string;
}

function ErrorBannerComponent({ message, title }: ErrorBannerProps) {
  return <Alert state="danger" title={title} text={message} showIcon />;
}

export const ErrorBanner = memo(ErrorBannerComponent);

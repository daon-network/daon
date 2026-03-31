<?php

namespace Daon;

class ProtectionResult
{
    private bool $success;
    private string $contentHash;
    private ?string $txHash;
    private ?string $verificationUrl;
    private ?string $blockchainUrl;
    private ?string $error;
    private \DateTime $timestamp;

    public function __construct(array $data)
    {
        $this->success = $data['success'] ?? false;
        $this->contentHash = $data['content_hash'] ?? '';
        $this->txHash = $data['tx_hash'] ?? null;
        $this->verificationUrl = $data['verification_url'] ?? null;
        $this->blockchainUrl = $data['blockchain_url'] ?? null;
        $this->error = $data['error'] ?? null;
        $this->timestamp = $data['timestamp'] ?? new \DateTime();
    }

    public function isSuccess(): bool { return $this->success; }
    public function getContentHash(): string { return $this->contentHash; }
    public function getTxHash(): ?string { return $this->txHash; }
    public function getVerificationUrl(): ?string { return $this->verificationUrl; }
    public function getBlockchainUrl(): ?string { return $this->blockchainUrl; }
    public function getError(): ?string { return $this->error; }
    public function getTimestamp(): \DateTime { return $this->timestamp; }
}

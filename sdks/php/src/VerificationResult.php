<?php

namespace Daon;

class VerificationResult
{
    private bool $verified;
    private string $contentHash;
    private ?string $license;
    private ?\DateTime $timestamp;
    private ?string $verificationUrl;
    private ?string $blockchainUrl;
    private ?string $error;

    public function __construct(array $data)
    {
        $this->verified = $data['verified'] ?? false;
        $this->contentHash = $data['content_hash'] ?? '';
        $this->license = $data['license'] ?? null;
        $this->timestamp = $data['timestamp'] ?? null;
        $this->verificationUrl = $data['verification_url'] ?? null;
        $this->blockchainUrl = $data['blockchain_url'] ?? null;
        $this->error = $data['error'] ?? null;
    }

    public function isVerified(): bool { return $this->verified; }
    public function getContentHash(): string { return $this->contentHash; }
    public function getLicense(): ?string { return $this->license; }
    public function getTimestamp(): ?\DateTime { return $this->timestamp; }
    public function getVerificationUrl(): ?string { return $this->verificationUrl; }
    public function getBlockchainUrl(): ?string { return $this->blockchainUrl; }
    public function getError(): ?string { return $this->error; }
}

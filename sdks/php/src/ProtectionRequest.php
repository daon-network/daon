<?php

namespace Daon;

class ProtectionRequest
{
    private string $content;
    private ?string $license;
    private ?string $creatorAddress;
    private array $metadata;

    public function __construct(
        string $content,
        array $metadata = [],
        ?string $license = null,
        ?string $creatorAddress = null
    ) {
        $this->content = $content;
        $this->metadata = $metadata;
        $this->license = $license;
        $this->creatorAddress = $creatorAddress;
    }

    public function getContent(): string { return $this->content; }
    public function getLicense(): ?string { return $this->license; }
    public function getCreatorAddress(): ?string { return $this->creatorAddress; }
    public function getMetadata(): array { return $this->metadata; }
}

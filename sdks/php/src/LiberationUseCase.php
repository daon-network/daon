<?php

namespace Daon;

class LiberationUseCase
{
    private string $entityType;
    private string $useType;
    private string $purpose;
    private bool $compensation;
    private array $metadata;

    public function __construct(array $data)
    {
        $this->entityType = $data['entity_type'] ?? 'individual';
        $this->useType = $data['use_type'] ?? 'personal';
        $this->purpose = $data['purpose'] ?? 'education';
        $this->compensation = $data['compensation'] ?? false;
        $this->metadata = $data['metadata'] ?? [];
    }

    public function getEntityType(): string { return $this->entityType; }
    public function getUseType(): string { return $this->useType; }
    public function getPurpose(): string { return $this->purpose; }
    public function isCompensated(): bool { return $this->compensation; }
    public function getMetadata(): array { return $this->metadata; }
}

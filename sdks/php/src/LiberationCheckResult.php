<?php

namespace Daon;

class LiberationCheckResult
{
    private bool $compliant;
    private string $reason;
    private LiberationUseCase $useCase;
    private array $recommendations;

    public function __construct(array $data)
    {
        $this->compliant = $data['compliant'] ?? false;
        $this->reason = $data['reason'] ?? '';
        $this->useCase = $data['use_case'];
        $this->recommendations = $data['recommendations'] ?? [];
    }

    public function isCompliant(): bool { return $this->compliant; }
    public function getReason(): string { return $this->reason; }
    public function getUseCase(): LiberationUseCase { return $this->useCase; }
    public function getRecommendations(): array { return $this->recommendations; }
}

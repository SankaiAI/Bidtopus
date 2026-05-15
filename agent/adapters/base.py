"""Abstract base classes for all external adapters.

Every adapter has a real implementation and a mock implementation.
The orchestrator always uses the abstract interface — never the concrete class directly.
Switch real ↔ mock via the META_ADS_MOCK / ARC_MOCK / CIRCLE_MOCK env flags.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from models.types import (
    EscrowStatus,
    PerformanceSnapshot,
    SettlementResult,
    StrategyAction,
    WalletBalance,
    WalletInfo,
)


class MetaAdsAdapterBase(ABC):
    @abstractmethod
    def get_performance(self, contract_id: str, day: int) -> PerformanceSnapshot: ...

    @abstractmethod
    def execute_action(self, contract_id: str, action: StrategyAction) -> dict: ...

    def get_account_context(self, account_id: str) -> dict:
        """Return historical Meta Ads context for an account.

        Default returns all-null fields so the endpoint never errors out when
        data is unavailable. Override in concrete adapters to fetch real data.
        """
        return {
            "meta_ads_account_id": account_id,
            "historical_roas_7d": None,
            "historical_roas_30d": None,
            "avg_daily_spend": None,
            "aov": None,
        }


class ArcEscrowAdapterBase(ABC):
    @abstractmethod
    def get_status(self, contract_id: str) -> EscrowStatus: ...

    @abstractmethod
    def release(self, contract_id: str, amount_usdc: float) -> SettlementResult: ...

    @abstractmethod
    def refund(self, contract_id: str, amount_usdc: float) -> SettlementResult: ...


class CircleWalletsAdapterBase(ABC):
    @abstractmethod
    def get_or_create_agent_wallet(self) -> WalletInfo: ...

    @abstractmethod
    def get_balance(self, wallet_id: str) -> WalletBalance: ...

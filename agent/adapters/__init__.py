"""External adapters — Meta Ads, Arc escrow, Circle Wallets."""
from adapters.arc_escrow import ArcEscrowAdapter
from adapters.circle_wallets import CircleWalletsAdapter
from adapters.meta_ads import MetaAdsAdapter, get_meta_ads_adapter

__all__ = [
    "ArcEscrowAdapter",
    "CircleWalletsAdapter",
    "MetaAdsAdapter",
    "get_meta_ads_adapter",
]

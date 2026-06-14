CREATE TABLE trades (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    trade_id BIGINT,
    price NUMERIC NOT NULL,
    quantity NUMERIC NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    ingest_time TIMESTAMPTZ NOT NULL
);

CREATE INDEX trades_symbol_event_time_idx ON trades (symbol, event_time DESC);
CREATE INDEX trades_exchange_event_time_idx ON trades (exchange, event_time DESC);
CREATE INDEX trades_trade_id_idx ON trades (trade_id);

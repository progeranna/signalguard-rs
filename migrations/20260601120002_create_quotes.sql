CREATE TABLE quotes (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    best_bid_price NUMERIC NOT NULL,
    best_bid_quantity NUMERIC NOT NULL,
    best_ask_price NUMERIC NOT NULL,
    best_ask_quantity NUMERIC NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    ingest_time TIMESTAMPTZ NOT NULL
);

CREATE INDEX quotes_symbol_event_time_idx ON quotes (symbol, event_time DESC);
CREATE INDEX quotes_exchange_event_time_idx ON quotes (exchange, event_time DESC);

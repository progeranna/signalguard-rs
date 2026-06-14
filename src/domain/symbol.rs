use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Symbol(String);

impl Symbol {
    pub fn new(value: impl Into<String>) -> Result<Self> {
        let normalized = value.into().trim().to_uppercase();

        if normalized.is_empty() {
            bail!("symbol must not be empty");
        }
        if !normalized
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
        {
            bail!("symbol must contain only ASCII letters and digits: {normalized}");
        }

        Ok(Self(normalized))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for Symbol {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::Symbol;

    #[test]
    fn symbol_is_normalized_to_uppercase() {
        let symbol = Symbol::new("btcusdt").unwrap();

        assert_eq!(symbol.as_str(), "BTCUSDT");
    }

    #[test]
    fn symbol_rejects_non_alphanumeric_values() {
        let error = Symbol::new("BTC-USDT").unwrap_err().to_string();

        assert!(error.contains("symbol must contain only ASCII letters and digits"));
    }
}

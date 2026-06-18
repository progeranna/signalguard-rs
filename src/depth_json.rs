use serde_json::Value;

pub(crate) fn parse_depth_level_pair_strings<E>(
    level: &Value,
    invalid_shape: impl Fn() -> E,
) -> Result<(&str, &str), E> {
    let Some(values) = level.as_array().filter(|values| values.len() == 2) else {
        return Err(invalid_shape());
    };

    let Some(price) = values[0].as_str() else {
        return Err(invalid_shape());
    };

    let Some(quantity) = values[1].as_str() else {
        return Err(invalid_shape());
    };

    Ok((price, quantity))
}

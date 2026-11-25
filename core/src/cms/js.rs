//! JS 语义辅助：在 serde_json::Value 上复刻 Node 版用到的 String()/Number()/真值/?? 等行为，
//! 保证输出 JSON 与 Node 版逐字段一致。
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde_json::Value;

/// encodeURIComponent 保留不编码的字符：A-Z a-z 0-9 - _ . ! ~ * ' ( )
const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

/// JS 整数可精确表示的上限（2^53），以及 Number→String 改用指数形式的阈值（1e21）
const MAX_SAFE_INT: f64 = 9_007_199_254_740_992.0;
const EXP_THRESHOLD: f64 = 1e21;

/// encodeURIComponent
pub fn encode_uri_component(s: &str) -> String {
    utf8_percent_encode(s, URI_COMPONENT).to_string()
}

/// JS String.prototype.trim：Unicode 空白 + BOM
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}

/// JS 真值判断（undefined 用 None 表示）
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// a ?? b：a 为 undefined/null 时取 b
pub fn nullish<'a>(a: Option<&'a Value>, b: Option<&'a Value>) -> Option<&'a Value> {
    match a {
        None | Some(Value::Null) => b,
        _ => a,
    }
}

/// a || b：a 为假值时取 b
pub fn or<'a>(a: Option<&'a Value>, b: Option<&'a Value>) -> Option<&'a Value> {
    if truthy(a) {
        a
    } else {
        b
    }
}

/// 取对象字段（非对象返回 None，相当于 undefined）
pub fn field<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    v.as_object().and_then(|m| m.get(key))
}

/// JS 数字转字符串（常见范围内与 V8 一致）
pub fn num_to_string(f: f64) -> String {
    if f.is_nan() {
        return "NaN".into();
    }
    if f.is_infinite() {
        return if f > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    if f.fract() == 0.0 && f.abs() < EXP_THRESHOLD {
        return format!("{}", f as i128);
    }
    format!("{f}")
}

/// String(v)；undefined 返回 "undefined"
pub fn js_str(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => match (n.as_i64(), n.as_u64()) {
            (Some(i), _) => i.to_string(),
            (_, Some(u)) => u.to_string(),
            _ => num_to_string(n.as_f64().unwrap_or(f64::NAN)),
        },
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a.iter().map(join_item).collect::<Vec<_>>().join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

/// Array.prototype.join 中的元素：null/undefined 变空串
fn join_item(v: &Value) -> String {
    if v.is_null() {
        String::new()
    } else {
        js_str(Some(v))
    }
}

/// Number(字符串)
fn str_to_number(s: &str) -> f64 {
    let t = js_trim(s);
    if t.is_empty() {
        return 0.0;
    }
    let radix = [("0x", 16), ("0X", 16), ("0o", 8), ("0O", 8), ("0b", 2), ("0B", 2)];
    for (p, r) in radix {
        if let Some(rest) = t.strip_prefix(p) {
            return u64::from_str_radix(rest, r).map(|n| n as f64).unwrap_or(f64::NAN);
        }
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let lower = t.to_ascii_lowercase();
    if lower.contains("inf") || lower.contains("nan") {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// Number(v)；undefined 为 NaN
pub fn js_number(v: Option<&Value>) -> f64 {
    match v {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => f64::from(u8::from(*b)),
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) => str_to_number(s),
        Some(Value::Array(a)) => match a.len() {
            0 => 0.0,
            1 => str_to_number(&js_str(a.first())),
            _ => f64::NAN,
        },
        Some(Value::Object(_)) => f64::NAN,
    }
}

/// 数字 → JSON 值（NaN/Infinity 与 JSON.stringify 一样输出 null，整数不带小数点）
pub fn num_value(f: f64) -> Value {
    if !f.is_finite() {
        return Value::Null;
    }
    if f.fract() == 0.0 && f.abs() <= MAX_SAFE_INT {
        return Value::from(f as i64);
    }
    serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null)
}

/// Number(x) || fallback
pub fn number_or(v: Option<&Value>, fallback: f64) -> f64 {
    let n = js_number(v);
    if n == 0.0 || n.is_nan() {
        fallback
    } else {
        n
    }
}

/// 拷贝可选值；None（undefined）返回 Value::Null 以外的「缺失」由调用方决定是否写入
pub fn owned(v: Option<&Value>, default: &str) -> Value {
    v.cloned().unwrap_or_else(|| Value::String(default.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn string_and_number() {
        assert_eq!("1,,a", js_str(Some(&json!([1, null, "a"]))));
        assert_eq!("undefined", js_str(None));
        assert_eq!(12.0, js_number(Some(&json!(" 12 "))));
        assert!(js_number(Some(&json!("abc"))).is_nan());
        assert!(js_number(Some(&json!("inf"))).is_nan());
        assert_eq!(0.0, js_number(Some(&json!(""))));
        assert_eq!(json!(3), num_value(3.0));
        assert_eq!(Value::Null, num_value(f64::NAN));
    }

    #[test]
    fn truthiness_and_encode() {
        assert!(!truthy(Some(&json!(0))));
        assert!(truthy(Some(&json!([]))));
        assert_eq!("a%20b%2F~!*()'", encode_uri_component("a b/~!*()'"));
    }
}

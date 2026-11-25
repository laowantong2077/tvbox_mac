//! JS 语义兼容工具：真值判断、String()/parseFloat()/parseInt()/Number() 等
//! 目的：让归一化结果与 Node 版逐字段一致
use serde::Serializer;
use serde_json::Value;

/// 能用 i64 精确表示的最大整数（2^53，与 JS Number.MAX_SAFE_INTEGER 同量级）
const MAX_SAFE_INT: f64 = 9_007_199_254_740_992.0;

/// JS 真值判断
pub fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// 数字按 JS 规则转字符串（整数不带 .0）
pub fn num_to_string(f: f64) -> String {
    if f.fract() == 0.0 && f.abs() < MAX_SAFE_INT {
        format!("{}", f as i64)
    } else {
        format!("{f}")
    }
}

/// JS String(v)：字符串原样、数字按 JS 格式、其余取 JSON 文本
pub fn js_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.as_f64().map(num_to_string).unwrap_or_default(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".into(),
        other => other.to_string(),
    }
}

/// JS `String(v || '')`：假值返回空串
pub fn str_or_empty(v: &Value) -> String {
    if truthy(v) {
        js_string(v)
    } else {
        String::new()
    }
}

/// 取对象字段（不存在返回 Null）
pub fn field<'a>(v: &'a Value, key: &str) -> &'a Value {
    v.get(key).unwrap_or(&Value::Null)
}

/// 截取字符串开头的数字前缀（parseFloat 语义）
fn float_prefix(s: &str) -> Option<f64> {
    static RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r"^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?").expect("float regex")
    });
    RE.find(s.trim_start()).and_then(|m| m.as_str().parse::<f64>().ok())
}

/// JS parseFloat(v)：数字直接取值，字符串取数字前缀，其余 NaN
pub fn parse_float(v: &Value) -> f64 {
    match v {
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => float_prefix(s).unwrap_or(f64::NAN),
        _ => f64::NAN,
    }
}

/// 对应 douban.js 的 toNumber：parseFloat 后非有限数取 0
pub fn to_number(v: &Value) -> f64 {
    let n = parse_float(v);
    if n.is_finite() {
        n
    } else {
        0.0
    }
}

/// JS parseInt(s, 10)：可选符号 + 数字前缀
pub fn parse_int(s: Option<&str>) -> Option<i64> {
    let s = s?.trim_start();
    let (neg, rest) = match s.as_bytes().first() {
        Some(b'-') => (true, &s[1..]),
        Some(b'+') => (false, &s[1..]),
        _ => (false, s),
    };
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    let n: i64 = digits.parse().ok()?;
    Some(if neg { -n } else { n })
}

/// JS Number(str)：去空白，空串为 0，非法为 NaN
pub fn js_number(s: Option<&str>) -> f64 {
    let Some(s) = s else { return f64::NAN };
    let t = s.trim();
    if t.is_empty() {
        return 0.0;
    }
    if let Some(hex) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        return i64::from_str_radix(hex, 16).map(|n| n as f64).unwrap_or(f64::NAN);
    }
    let unsigned = t.trim_start_matches(['+', '-']);
    if unsigned == "Infinity" {
        return if t.starts_with('-') { f64::NEG_INFINITY } else { f64::INFINITY };
    }
    // Rust 额外接受 inf/nan 字样，JS 不接受
    if unsigned.chars().any(|c| c.is_ascii_alphabetic() && c != 'e' && c != 'E') {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// serde 序列化：整数值的 f64 输出为整数（与 JS JSON.stringify 一致）
pub fn ser_num<S: Serializer>(f: &f64, s: S) -> Result<S::Ok, S::Error> {
    if f.fract() == 0.0 && f.abs() < MAX_SAFE_INT {
        s.serialize_i64(*f as i64)
    } else {
        s.serialize_f64(*f)
    }
}

/// 可选数字的序列化（配合 skip_serializing_if 使用）
pub fn ser_opt_num<S: Serializer>(f: &Option<f64>, s: S) -> Result<S::Ok, S::Error> {
    match f {
        Some(v) => ser_num(v, s),
        None => s.serialize_none(),
    }
}

/// 当前毫秒时间戳（Date.now()）
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn truthy_and_str() {
        assert!(!truthy(&json!(0)));
        assert!(!truthy(&json!("")));
        assert!(truthy(&json!([])));
        assert_eq!("123", str_or_empty(&json!(123)));
        assert_eq!("", str_or_empty(&json!(null)));
        assert_eq!("7.5", js_string(&json!(7.5)));
    }

    #[test]
    fn parse_numbers() {
        assert_eq!(7.5, to_number(&json!("7.5")));
        assert_eq!(8.0, to_number(&json!("8abc")));
        assert_eq!(0.0, to_number(&json!(null)));
        assert_eq!(0.0, to_number(&json!("")));
        assert_eq!(Some(12), parse_int(Some(" 12px")));
        assert_eq!(Some(-3), parse_int(Some("-3")));
        assert_eq!(None, parse_int(Some("abc")));
        assert_eq!(0.0, js_number(Some(" ")));
        assert!(js_number(Some("1a")).is_nan());
        assert_eq!(16777215.0, js_number(Some("16777215")));
    }
}

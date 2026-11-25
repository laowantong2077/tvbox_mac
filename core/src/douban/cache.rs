//! 带 TTL 与容量上限的内存缓存（对应 JS 中基于 Map 的 cached()）
//! - 命中且未过期直接返回；否则调用 loader，成功才写入
//! - 超过容量时淘汰最早插入的键（与 JS Map 迭代顺序一致）
use anyhow::Result;
use parking_lot::Mutex;
use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::time::{Duration, Instant};

struct Inner<V> {
    map: HashMap<String, (Instant, V)>,
    order: VecDeque<String>,
}

pub struct TtlCache<V> {
    ttl: Duration,
    cap: usize,
    inner: Mutex<Inner<V>>,
}

impl<V: Clone> TtlCache<V> {
    pub fn new(ttl: Duration, cap: usize) -> Self {
        Self { ttl, cap, inner: Mutex::new(Inner { map: HashMap::new(), order: VecDeque::new() }) }
    }

    /// 读取未过期的缓存值
    pub fn get(&self, key: &str) -> Option<V> {
        let g = self.inner.lock();
        g.map.get(key).filter(|(at, _)| at.elapsed() < self.ttl).map(|(_, v)| v.clone())
    }

    /// 写入（新键追加到队尾，超容量淘汰队首）
    pub fn put(&self, key: &str, value: V) {
        let mut g = self.inner.lock();
        if !g.map.contains_key(key) {
            g.order.push_back(key.to_string());
        }
        g.map.insert(key.to_string(), (Instant::now(), value));
        while g.map.len() > self.cap {
            match g.order.pop_front() {
                Some(old) => {
                    g.map.remove(&old);
                }
                None => break,
            }
        }
    }

    /// 命中返回缓存，否则执行 loader 并缓存成功结果
    pub async fn get_or_load<F, Fut>(&self, key: &str, loader: F) -> Result<V>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<V>>,
    {
        if let Some(v) = self.get(key) {
            return Ok(v);
        }
        let v = loader().await?;
        self.put(key, v.clone());
        Ok(v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evicts_oldest() {
        let c = TtlCache::new(Duration::from_secs(60), 2);
        c.put("a", 1);
        c.put("b", 2);
        c.put("c", 3);
        assert_eq!(None, c.get("a"));
        assert_eq!(Some(3), c.get("c"));
    }

    #[test]
    fn expires() {
        let c = TtlCache::new(Duration::from_millis(0), 2);
        c.put("a", 1);
        assert_eq!(None, c.get("a"));
    }
}

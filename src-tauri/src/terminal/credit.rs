//! Backpressure between a pane's PTY reader and the screen that draws its bytes.
use std::sync::{Condvar, Mutex};

/// Bytes sent but not yet drawn never exceed `limit`. The reader reserves before it reads.
pub struct Credit {
    limit: usize,
    state: Mutex<State>,
    freed: Condvar,
}

#[derive(Default)]
struct State {
    outstanding: usize,
    closed: bool,
}

impl Credit {
    pub fn new(limit: usize) -> Self {
        Credit {
            limit,
            state: Mutex::default(),
            freed: Condvar::new(),
        }
    }

    /// Blocks until `want` more bytes fit under the limit, then holds them. `None` once closed.
    pub fn reserve(&self, want: usize) -> Option<usize> {
        let want = want.min(self.limit);
        let mut s = self.state.lock().unwrap();
        while !s.closed && s.outstanding + want > self.limit {
            s = self.freed.wait(s).unwrap();
        }
        if s.closed {
            return None;
        }
        s.outstanding += want;
        Some(want)
    }

    /// Gives back `n` reserved bytes: drawn by the screen, or not read after all.
    pub fn release(&self, n: usize) {
        let mut s = self.state.lock().unwrap();
        s.outstanding = s.outstanding.saturating_sub(n);
        self.freed.notify_all();
    }

    /// Wakes a blocked reader for good; every later `reserve` is `None`.
    pub fn close(&self) {
        self.state.lock().unwrap().closed = true;
        self.freed.notify_all();
    }

    #[cfg(test)]
    pub fn outstanding(&self) -> usize {
        self.state.lock().unwrap().outstanding
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn reserves_up_to_the_limit_without_waiting() {
        let c = Credit::new(100);
        assert_eq!(c.reserve(60), Some(60));
        assert_eq!(c.reserve(40), Some(40));
        assert_eq!(c.outstanding(), 100);
    }

    #[test]
    fn caps_a_reservation_larger_than_the_limit() {
        let c = Credit::new(100);
        assert_eq!(c.reserve(500), Some(100));
    }

    #[test]
    fn blocks_until_the_screen_releases_enough() {
        let c = Arc::new(Credit::new(100));
        c.reserve(80);
        let (tx, rx) = mpsc::channel();
        let reader = {
            let c = c.clone();
            thread::spawn(move || tx.send(c.reserve(40)).unwrap())
        };
        assert!(
            rx.recv_timeout(Duration::from_millis(100)).is_err(),
            "must wait"
        );
        c.release(10);
        assert!(
            rx.recv_timeout(Duration::from_millis(100)).is_err(),
            "70 + 40 > 100"
        );
        c.release(10);
        assert_eq!(rx.recv_timeout(Duration::from_secs(2)).unwrap(), Some(40));
        reader.join().unwrap();
        assert_eq!(c.outstanding(), 100);
    }

    #[test]
    fn close_wakes_a_blocked_reader_with_none() {
        let c = Arc::new(Credit::new(10));
        c.reserve(10);
        let reader = {
            let c = c.clone();
            thread::spawn(move || c.reserve(1))
        };
        thread::sleep(Duration::from_millis(50));
        c.close();
        assert_eq!(reader.join().unwrap(), None);
        assert_eq!(c.reserve(1), None);
    }

    #[test]
    fn over_release_never_underflows() {
        let c = Credit::new(10);
        c.reserve(4);
        c.release(9);
        assert_eq!(c.outstanding(), 0);
    }

    #[test]
    fn outstanding_never_passes_the_limit_under_contention() {
        let c = Arc::new(Credit::new(1 << 20));
        let peak = Arc::new(Mutex::new(0usize));
        let (tx, rx) = mpsc::channel::<usize>();
        let reader = {
            let (c, peak) = (c.clone(), peak.clone());
            thread::spawn(move || {
                for _ in 0..2_000 {
                    let n = c.reserve(64 * 1024).unwrap();
                    let now = c.outstanding();
                    let mut p = peak.lock().unwrap();
                    *p = (*p).max(now);
                    tx.send(n).unwrap();
                }
            })
        };
        let mut drawn = 0;
        while drawn < 2_000 {
            let n = rx.recv().unwrap();
            c.release(n);
            drawn += 1;
        }
        reader.join().unwrap();
        assert!(*peak.lock().unwrap() <= 1 << 20);
        assert_eq!(c.outstanding(), 0);
    }
}

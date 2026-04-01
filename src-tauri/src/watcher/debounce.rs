use notify::Event;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

pub fn debounced_receiver<F>(
    rx: Receiver<notify::Result<Event>>,
    window: Duration,
    mut callback: F,
) where
    F: FnMut(Vec<Event>),
{
    let mut pending: Vec<Event> = Vec::new();

    loop {
        // Block until first event — zero CPU when idle
        match rx.recv() {
            Ok(Ok(event)) => {
                pending.push(event);
            }
            Ok(Err(_)) => continue,
            Err(_) => break,
        }

        // Drain remaining events within the debounce window
        let mut last_received = Instant::now();
        loop {
            match rx.recv_timeout(Duration::from_millis(20)) {
                Ok(Ok(e)) => {
                    pending.push(e);
                    last_received = Instant::now();
                }
                Ok(Err(_)) => continue,
                Err(RecvTimeoutError::Timeout) => {
                    if last_received.elapsed() >= window {
                        callback(std::mem::take(&mut pending));
                        break;
                    }
                }
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }
}

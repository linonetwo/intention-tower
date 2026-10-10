use crossbeam_channel::{Receiver, Sender};

#[derive(Debug)]
pub enum TestMessage {
    EvaluateScript {
        script: String,
        response: Sender<String>,
    },
}

pub struct TestChannel {
    pub sender: Sender<TestMessage>,
    pub receiver: Receiver<TestMessage>,
}

static TEST_CHANNEL: std::sync::OnceLock<TestChannel> = std::sync::OnceLock::new();

pub fn init_test_channel() -> Sender<TestMessage> {
    let (tx, rx) = crossbeam_channel::unbounded();
    let sender_clone = tx.clone();
    let _ = TEST_CHANNEL.set(TestChannel {
        sender: tx,
        receiver: rx,
    });
    sender_clone
}

pub fn get_test_receiver() -> Option<&'static Receiver<TestMessage>> {
    TEST_CHANNEL.get().map(|c| &c.receiver)
}
